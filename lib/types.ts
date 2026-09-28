export const STATUSES = ["new", "sent", "replied", "call_booked", "client", "no"] as const;
export type Status = (typeof STATUSES)[number];
export type Category = "salao" | "pet";

export type Lead = {
  id: string;
  business_name: string;
  category: Category;
  neighbourhood: string;
  address: string;
  google_maps_url: string;
  whatsapp: string | null;
  instagram_url: string | null;
  website: string | null;
  source_of_whatsapp: "google" | "site" | "instagram" | "not_found";
  week: string;
  messages: string[];
  status: Status;
  status_history: { status: Status; at: string }[];
  notes: string;
};

export type LeadPatch = { status?: Status; notes?: string };

export const STATUS_LABEL: Record<Status, string> = {
  new: "Novo",
  sent: "Enviado",
  replied: "Respondeu",
  call_booked: "Call marcada",
  client: "Cliente",
  no: "Não",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  salao: "Salão",
  pet: "Pet",
};

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}
