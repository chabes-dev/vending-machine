export const metadata = { title: "Entrar · Prospecção" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/login" className="login-card">
        <h1>Prospecção</h1>
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
        {erro && <p className="error">Senha incorreta</p>}
        <button type="submit" className="btn-primary">
          Entrar
        </button>
      </form>
    </main>
  );
}
