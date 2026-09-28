"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABEL, STATUSES, STATUS_LABEL, type Category, type Lead, type LeadPatch, type Status } from "@/lib/types";

const ALL = "all";

function reached(lead: Lead, s: Status): boolean {
  return lead.status === s || (lead.status_history ?? []).some((h) => h.status === s);
}

function waLink(number: string, text: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

function formatWeek(iso: string) {
  const [y, m, d] = iso.split("-");
  return `Semana de ${d}/${m}/${y}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export default function Prospeccao({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const weeks = useMemo(() => [...new Set(leads.map((l) => l.week))].sort().reverse(), [leads]);
  const [week, setWeek] = useState<string>(weeks[0] ?? ALL);
  const [category, setCategory] = useState<Category | typeof ALL>(ALL);
  const [status, setStatus] = useState<Status | typeof ALL>(ALL);
  const [toast, setToast] = useState<string | null>(null);
  const pending = useRef(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Pull fresh data when coming back to the tab (e.g. after sending on WhatsApp),
  // so new weekly batches and edits from another device show up.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || pending.current > 0) return;
      try {
        const res = await fetch("/api/leads", { cache: "no-store" });
        if (res.status === 401) return location.assign("/login");
        if (res.ok && pending.current === 0) setLeads(await res.json());
      } catch {}
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const save = useCallback(
    async (id: string, patch: LeadPatch): Promise<boolean> => {
      const before = leads.find((l) => l.id === id);
      if (!before) return false;
      // Optimistic update
      setLeads((ls) =>
        ls.map((l) => {
          if (l.id !== id) return l;
          const next = { ...l, ...patch };
          if (patch.status && patch.status !== l.status) {
            next.status_history = [...(l.status_history ?? []), { status: patch.status, at: new Date().toISOString() }];
          }
          return next;
        }),
      );
      pending.current++;
      try {
        const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.status === 401) {
          location.assign("/login");
          return false;
        }
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "erro");
        const saved: Lead = await res.json();
        setLeads((ls) => ls.map((l) => (l.id === id ? saved : l)));
        return true;
      } catch (e) {
        setLeads((ls) => ls.map((l) => (l.id === id ? before : l)));
        showToast(`Não salvou: ${(e as Error).message}`);
        return false;
      } finally {
        pending.current--;
      }
    },
    [leads, showToast],
  );

  const scoped = leads.filter((l) => (week === ALL || l.week === week) && (category === ALL || l.category === category));
  const visible = scoped.filter((l) => status === ALL || l.status === status);

  const counters = [
    { label: "Enviados", value: scoped.filter((l) => reached(l, "sent") || ["replied", "call_booked", "client"].includes(l.status)).length },
    { label: "Respostas", value: scoped.filter((l) => reached(l, "replied") || ["call_booked", "client"].includes(l.status)).length },
    { label: "Calls", value: scoped.filter((l) => reached(l, "call_booked") || l.status === "client").length },
    { label: "Clientes", value: scoped.filter((l) => reached(l, "client")).length },
  ];

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <h1>Prospecção</h1>
          <form method="post" action="/api/logout">
            <button className="link-btn" type="submit">
              Sair
            </button>
          </form>
        </div>
        <div className="counters">
          {counters.map((c) => (
            <div key={c.label} className="counter">
              <strong>{c.value}</strong>
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      </header>

      <section className="filters" aria-label="Filtros">
        <select value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Semana">
          {weeks.map((w, i) => (
            <option key={w} value={w}>
              {formatWeek(w)}
              {i === 0 ? " (atual)" : ""}
            </option>
          ))}
          <option value={ALL}>Todas as semanas</option>
        </select>
        <div className="chips scroll">
          {([ALL, "salao", "pet"] as const).map((c) => (
            <button key={c} className={`chip ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>
              {c === ALL ? "Todos" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="chips scroll">
          {([ALL, ...STATUSES] as const).map((s) => (
            <button key={s} className={`chip ${status === s ? "on" : ""}`} onClick={() => setStatus(s)}>
              {s === ALL ? "Todos status" : STATUS_LABEL[s]}
              <span className="count">{s === ALL ? scoped.length : scoped.filter((l) => l.status === s).length}</span>
            </button>
          ))}
        </div>
      </section>

      <main className="list">
        {visible.length === 0 && <p className="empty">Nenhum lead com esses filtros.</p>}
        {visible.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onSave={save} />
        ))}
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, onSave }: { lead: Lead; onSave: (id: string, p: LeadPatch) => Promise<boolean> }) {
  const [msg1, msg2, msg3] = lead.messages;
  const [copied, setCopied] = useState<number | null>(null);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");

  // Keep the field in sync if the lead is refreshed from the server while not editing.
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setNotes(lead.notes ?? "");
  }, [lead.notes]);

  const copy = async (i: number, text: string) => {
    await copyText(text);
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
  };

  const saveNotes = async () => {
    editing.current = false;
    if (notes === (lead.notes ?? "")) return;
    setNoteState("saving");
    const ok = await onSave(lead.id, { notes });
    setNoteState(ok ? "saved" : "idle");
    if (ok) setTimeout(() => setNoteState("idle"), 1500);
  };

  return (
    <article className={`card status-${lead.status}`}>
      <div className="card-head">
        <div>
          <h2>{lead.business_name}</h2>
          <p className="meta">
            <span className={`tag tag-${lead.category}`}>{CATEGORY_LABEL[lead.category] ?? lead.category}</span>
            {lead.neighbourhood}
          </p>
        </div>
        <a className="maps" href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" aria-label="Abrir no Google Maps">
          📍 Maps
        </a>
      </div>

      {lead.whatsapp && msg1 ? (
        <a
          className="btn-primary btn-wa"
          href={waLink(lead.whatsapp, msg1)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (lead.status === "new") onSave(lead.id, { status: "sent" });
          }}
        >
          Enviar no WhatsApp
        </a>
      ) : lead.instagram_url ? (
        <a className="btn-primary btn-ig" href={lead.instagram_url} target="_blank" rel="noopener noreferrer">
          Checar Instagram
        </a>
      ) : (
        <p className="no-contact">Sem WhatsApp nem Instagram</p>
      )}

      <div className="copy-row">
        {[msg2, msg3].map((m, i) =>
          m ? (
            <button key={i} className={`btn-secondary ${copied === i ? "done" : ""}`} onClick={() => copy(i, m)}>
              {copied === i ? "✓ Copiado" : `Copiar msg ${i + 2}`}
            </button>
          ) : null,
        )}
      </div>

      <div className="status-grid" role="group" aria-label="Status">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`chip status-chip s-${s} ${lead.status === s ? "on" : ""}`}
            aria-pressed={lead.status === s}
            onClick={() => lead.status !== s && onSave(lead.id, { status: s })}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="notes">
        <textarea
          rows={2}
          placeholder="Notas…"
          value={notes}
          maxLength={2000}
          onFocus={() => (editing.current = true)}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
        />
        {noteState !== "idle" && <span className="note-state">{noteState === "saving" ? "salvando…" : "salvo ✓"}</span>}
      </div>
    </article>
  );
}
