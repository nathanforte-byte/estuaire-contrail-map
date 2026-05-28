import { useState } from "react";

export default function GateBand() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!email) return;
    // v0.6 will POST to /api/lead → Supabase + Slack.
    console.log("lead", email);
    setSent(true);
  };

  return (
    <div className="absolute bottom-10 left-1/2 z-20 -translate-x-1/2 w-[min(420px,calc(100vw-32px))]">
      {sent ? (
        <div className="rounded-full border border-[#3273ff] bg-[#0f1c35] px-5 py-2 text-center text-sm text-[#cfd9ff]">
          Thanks — we'll reach out within 24 hours.
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="flex items-center gap-1 rounded-full border border-[#3273ff] bg-[#0a142a]/80 p-1 pl-4 backdrop-blur-md"
        >
          <input
            type="email"
            required
            placeholder="work@airline.com — request access"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-[#5e6f93] outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-[#3273ff] px-4 py-[7px] text-[12.5px] font-semibold tracking-[-0.005em] text-white transition-[filter] hover:brightness-110 active:scale-[0.97]"
          >
            Get Access
          </button>
        </form>
      )}
    </div>
  );
}
