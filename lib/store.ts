import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Lead, LeadPatch } from "./types";

const FILE_PATH = "data/leads.json";
const API = "https://api.github.com";

type Snapshot = { leads: Lead[]; sha: string | null };

function repoConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "chabes-dev/vending-machine";
  const branch = process.env.GITHUB_BRANCH ?? "main";
  return { token, repo, branch };
}

function gh(pathname: string, init: RequestInit = {}) {
  const { token } = repoConfig();
  return fetch(`${API}${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
}

// Without GITHUB_TOKEN (local dev) we read/write the file on disk.
const useLocal = () => !process.env.GITHUB_TOKEN;
const localPath = () => path.join(process.cwd(), FILE_PATH);

async function read(): Promise<Snapshot> {
  if (useLocal()) {
    return { leads: JSON.parse(await fs.readFile(localPath(), "utf8")), sha: null };
  }
  const { repo, branch } = repoConfig();
  const res = await gh(`/repos/${repo}/contents/${FILE_PATH}?ref=${encodeURIComponent(branch)}`);
  if (!res.ok) throw new Error(`GitHub GET ${res.status}: ${await res.text()}`);
  const meta = (await res.json()) as { sha: string; content?: string; encoding?: string };
  let b64 = meta.encoding === "base64" ? meta.content ?? "" : "";
  if (!b64) {
    // Files > 1 MB come back without content; fetch the blob instead.
    const blob = await gh(`/repos/${repo}/git/blobs/${meta.sha}`);
    if (!blob.ok) throw new Error(`GitHub blob ${blob.status}`);
    b64 = ((await blob.json()) as { content: string }).content;
  }
  const text = Buffer.from(b64, "base64").toString("utf8");
  return { leads: JSON.parse(text), sha: meta.sha };
}

export async function getLeads(): Promise<Lead[]> {
  return (await read()).leads;
}

function applyPatch(lead: Lead, patch: LeadPatch): Lead {
  const next = { ...lead };
  if (patch.status && patch.status !== lead.status) {
    next.status = patch.status;
    next.status_history = [...(lead.status_history ?? []), { status: patch.status, at: new Date().toISOString() }];
  }
  if (patch.notes !== undefined) next.notes = patch.notes;
  return next;
}

/**
 * Re-reads the latest file, applies the patch to one lead by id, and commits
 * with the fetched sha. If someone else committed in between (409/422), retry
 * on top of their version — so other leads and newly appended batches survive.
 */
export async function updateLead(id: string, patch: LeadPatch): Promise<Lead> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { leads, sha } = await read();
    const idx = leads.findIndex((l) => l.id === id);
    if (idx === -1) throw new NotFoundError(id);
    const updated = applyPatch(leads[idx], patch);
    leads[idx] = updated;
    const body = JSON.stringify(leads, null, 2) + "\n";

    if (useLocal()) {
      await fs.writeFile(localPath(), body, "utf8");
      return updated;
    }

    const { repo, branch } = repoConfig();
    const what = patch.status ? `status → ${patch.status}` : "notas";
    const res = await gh(`/repos/${repo}/contents/${FILE_PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `prospecção: ${updated.business_name} (${what})`,
        content: Buffer.from(body, "utf8").toString("base64"),
        sha,
        branch,
      }),
    });
    if (res.ok) return updated;
    if (res.status === 409 || res.status === 422) {
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1) + Math.random() * 200));
      continue;
    }
    throw new Error(`GitHub PUT ${res.status}: ${await res.text()}`);
  }
  throw new Error("Conflito persistente ao salvar, tente de novo");
}

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`Lead não encontrado: ${id}`);
  }
}
