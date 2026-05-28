import { useState } from "react";

export default function GatePanel() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!email) return;
    // v0.6 will POST to /api/lead → Supabase + Slack ping.
    console.log("lead", email);
    setSent(true);
  };

  return (
    <aside
      className="
        glass w-[min(320px,calc(100vw-32px))]
        rounded-2xl px-5 pb-[18px] pt-4
        animate-in fade-in slide-in-from-bottom-2 duration-500
      "
    >
      <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#7b9cda]">
        For operators
      </div>
      <h3 className="mb-1 text-[15px] font-semibold leading-tight tracking-[-0.015em] text-[#edeffd]">
        Track contrails by your fleet
      </h3>
      <p className="mb-3 max-w-[35ch] text-[12px] leading-[1.5] text-[#a0aac3]">
        Daily report of contrail-formation crossings per airframe, route, and operator. Built on
        Estuaire's full physics model.
      </p>

      {sent ? (
        <div className="rounded-md border border-[#3273ff]/40 bg-[#3273ff]/10 px-3 py-[7px] text-[12px] text-[#cfd9ff]">
          We'll reach out within 24 hours.
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            type="email"
            required
            placeholder="work@airline.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="
              w-full rounded-md border border-white/5 bg-white/[0.025] px-3 py-[8px]
              text-[13px] outline-none placeholder:text-[#5e6f93]
              focus:border-[#3273ff] focus:bg-white/[0.04]
            "
          />
          <button
            type="submit"
            className="
              inline-flex items-center justify-center gap-2 rounded-md
              bg-gradient-to-b from-[#3a82ff] to-[#2766db]
              px-3 py-[8px] text-[13px] font-semibold tracking-[-0.005em] text-white
              shadow-[inset_0_1px_0_rgb(255_255_255_/_0.2),0_8px_24px_-12px_rgb(50_115_255_/_0.6)]
              transition-[filter,transform] hover:brightness-110 active:scale-[0.97]
            "
          >
            Get access
            <Arrow />
          </button>
        </form>
      )}
    </aside>
  );
}

function Arrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6h7M6 3l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
