import { useState } from "react";

export default function GatePanel() {
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    // v0.6 will POST to /api/lead → Supabase + Slack ping.
    console.log("lead", email);
    setSent(true);
  };

  return (
    <div className="panel panel--gate gate">
      <h3>Track your fleet</h3>
      <p>
        Get a daily report of contrails created by your aircraft — by route,
        airframe, and operator. Built on Estuaire's full physics model.
      </p>
      {sent ? (
        <div className="ok">Thanks — we'll reach out shortly.</div>
      ) : (
        <form onSubmit={submit}>
          <input
            required
            type="email"
            name="email"
            placeholder="work@airline.com"
          />
          <button type="submit">Get demo</button>
        </form>
      )}
    </div>
  );
}
