import { NextResponse } from "next/server";
import { NotFoundError, updateLead } from "@/lib/store";
import { isStatus, type LeadPatch } from "@/lib/types";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: LeadPatch = {};
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return NextResponse.json({ error: "status inválido" }, { status: 400 });
    patch.status = body.status;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" || body.notes.length > 2000) {
      return NextResponse.json({ error: "notas inválidas" }, { status: 400 });
    }
    patch.notes = body.notes;
  }
  if (!patch.status && patch.notes === undefined) {
    return NextResponse.json({ error: "nada para salvar" }, { status: 400 });
  }

  try {
    return NextResponse.json(await updateLead(id, patch));
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Falha ao salvar no GitHub" }, { status: 502 });
  }
}
