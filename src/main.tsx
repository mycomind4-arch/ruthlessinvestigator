import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const agents = [
  { model: "OPENAI", role: "Lead Investigator", status: "active", text: "I've separated announced capacity from operational capacity. We need utilization data before treating construction as evidence of demand." },
  { model: "ANTHROPIC", role: "Skeptic", status: "active", text: "Agreed. I'm testing whether the strongest demand figures are projections rather than observed consumption." },
  { model: "GOOGLE", role: "OSINT Analyst", status: "researching", text: "I found a contradictory estimate. Tracing it back to the primary source now." },
  { model: "MISTRAL", role: "Financial Investigator", status: "queued", text: "I'll map developers, investors, incentives, and financing once the project list is normalized." },
];

const events = [
  ["23:41:04", "Evidence Agent", "Located DOE electricity-demand analysis"],
  ["23:41:18", "Anthropic / Skeptic", "Flagged projected-vs-observed demand distinction"],
  ["23:41:36", "Google / OSINT", "Found contradictory estimate; source tracing in progress"],
  ["23:42:02", "OpenAI / Lead", "Created research task: actual utilization data"],
  ["23:42:21", "Adversarial Council", "Opened challenge against primary-demand hypothesis"],
];

function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">R</span><div><strong>RUTHLESS</strong><span> INVESTIGATOR</span></div></div>
        <div className="live"><i /> LIVE INVESTIGATION</div>
        <button className="stop">Pause Council</button>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow">ACTIVE INVESTIGATION · #RI-0001</div>
          <h1>Why is the United States<br /><em>building so many data centers?</em></h1>
          <p>Six model families. Independent investigations. Adversarial review. One evidence-backed assessment.</p>
          <div className="stats"><span><b>4</b> model divisions</span><span><b>12</b> agents</span><span><b>247</b> sources</span><span><b>8</b> hypotheses</span></div>
        </section>

        <section className="council">
          <div className="section-title"><span>THE COUNCIL</span><small>Agents collaborate through auditable research events</small></div>
          <div className="agent-grid">
            {agents.map((a) => <article className={`agent ${a.status}`} key={a.model}>
              <div className="agent-head"><div><b>{a.model}</b><small>{a.role}</small></div><span className="status">{a.status}</span></div>
              <p>“{a.text}”</p>
              <div className="agent-foot">RESEARCH CHANNEL <span>•••</span></div>
            </article>)}
          </div>
        </section>

        <section className="workspace">
          <div className="feed panel"><div className="panel-head"><span>INVESTIGATION FEED</span><small>LIVE</small></div>{events.map(([time, who, text]) => <div className="event" key={time}><time>{time}</time><div><b>{who}</b><p>{text}</p></div></div>)}</div>
          <div className="hypotheses panel"><div className="panel-head"><span>HYPOTHESES</span><small>UPDATED 12s AGO</small></div>{[["Genuine AI / cloud demand",91,"strong"],["Strategic infrastructure",78,"strong"],["Financial incentives",73,"moderate"],["Speculative overbuilding",61,"moderate"],["Energy / utility arbitrage",54,"weak"],["Coordinated hidden program",18,"weak"]].map(([name, score, level]) => <div className="hyp" key={name as string}><div><span>{name}</span><b>{score}%</b></div><div className="bar"><i style={{width:`${score}%`}} /></div><small>{level}</small></div>)}</div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
