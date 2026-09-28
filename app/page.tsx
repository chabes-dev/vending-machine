import { getLeads } from "@/lib/store";
import Prospeccao from "./prospeccao";

export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    const leads = await getLeads();
    return <Prospeccao initialLeads={leads} />;
  } catch (e) {
    console.error(e);
    return (
      <main className="login">
        <div className="login-card">
          <h1>Erro ao carregar</h1>
          <p>Não consegui ler data/leads.json. Confira GITHUB_TOKEN, GITHUB_REPO e GITHUB_BRANCH.</p>
        </div>
      </main>
    );
  }
}
