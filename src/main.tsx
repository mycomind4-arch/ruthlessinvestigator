import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Agent = { model: string; role: string; status: "active" | "researching" | "queued" | "challenging"; text: string };
type Event = [string, string, string];

const seedAgents: Agent[] = [
  { model: "OPENAI", role: "Lead Investigator", status: "active", text: "I've separated announced capacity from operational capacity. We need utilization data before treating construction as evidence of demand." },
  { model: "ANTHROPIC", role: "Skeptic", status: "active", text: "I'm testing whether the strongest demand figures are projections rather than observed consumption." },
  { model: "GOOGLE", role: "OSINT Analyst", status: "researching", text: "I found a contradictory estimate. I'm tracing it back to the primary source." },
  { model: "MISTRAL", role: "Financial Investigator", status: "queued", text: "I'll map developers, investors, incentives, and financing once the project list is normalized." },
];

const seedEvents: Event[] = [
  ["23:41:04", "Evidence Agent", "Located DOE electricity-demand analysis"],
  ["23:41:18", "Anthropic / Skeptic", "Flagged projected-vs-observed demand distinction"],
  ["23:41:36", "Google / OSINT", "Found contradictory estimate; source tracing in progress"],
  ["23:42:02", "OpenAI / Lead", "Created research task: actual utilization data"],
  ["23:42:21", "Adversarial Council", "Opened challenge against primary-demand hypothesis"],
];

const newEvents: Event[] = [
  ["23:42:39", "Anthropic / Skeptic", "Requesting independent utilization measurements"],
  ["23:42:56", "Google / OSINT", "Citation cluster found; collapsing 14 articles to 3 underlying sources"],
  ["23:43:14", "OpenAI / Lead", "H1 remains strong, but announced capacity is not equivalent to demand"],
  ["23:43:31", "Adversarial Council", "Searching for evidence that financial incentives explain construction volume"],
  ["23:43:49", "Mistral / Finance", "Queued developer and tax-incentive ownership analysis"],
];

const hypotheses = [
  ["Genuine AI / cloud demand", 91, "strong"],
  ["Strategic infrastructure", 78, "strong"],
  ["Financial incentives", 73, "moderate"],
  ["Speculative overbuilding", 61, "moderate"],
  ["Energy / utility arbitrage", 54, "weak"],
  ["Coordinated hidden program", 18, "weak"],
] as const;

function App() {
  const [running, setRunning] = useState(true);
  const [events, setEvents] = useState<Event[]>(seedEvents);
  const [agents, setAgents] = useState(seedAgents);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setTick((n) => n + 1);
      setEvents((current) => {
        const next = newEvents[(current.length - seedEvents.length) % newEvents.length];
        return next ? [...current.slice(-6), next] : current;
      });
      setAgents((current) => current.map((agent, index) => ({
        ...agent,
        status: index === tick % current.length ? "challenging" : index === (tick + 1) % current.length ? "researching" : agent.status,
      })));
    }, 3200);
    return () => window.clearInterval(timer);
  }, [running, tick]);

  const sourceCount = useMemo(() => 247 + Math.min(tick * 3, 99), [tick]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">R</span><div><strong>RUTHLESS</strong><span> INVESTIGATOR</span></div></div>
        <div className="live"><i /> {running ? "LIVE INVESTIGATION" : "INVESTIGATION PAUSED"}</div>
        <button className="stop" onClick={() => setRunning((value) => !value)}>{running ? "Pause Council" : "Resume Council"}</button>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow">ACTIVE INVESTIGATION · #RI-0001</div>
          <h1>Why is the United States<br /><em>building so many data centers?</em></h1>
          <p>Independent model teams research the question, challenge one another, trace evidence to its origin, and continuously update competing explanations.</p>
          <div className="stats"><span><b>4</b> model divisions</span><span><b>12</b> agents</span><span><b>{sourceCount}</b> sources</span><span><b>8</b> hypotheses</span></div>
        </section>

        <section className="council">
          <div className="section-title"><span>THE COUNCIL</span><small>Auditable agent-to-agent investigation</small></div>
          <div className="agent-grid">
            {agents.map((a) => <article className={`agent ${a.status}`} key={a.model}>
              <div className="agent-head"><div><b>{a.model}</b><small>{a.role}</small></div><span className="status">{a.status}</span></div>
              <p>“{a.text}”</p>
              <div className="agent-foot">RESEARCH CHANNEL <span>•••</span></div>
            </article>)}
          </div>
        </section>

        <section className="workspace">
          <div className="feed panel"><div className="panel-head"><span>INVESTIGATION FEED</span><small>{running ? "LIVE" : "PAUSED"}</small></div>{events.slice().reverse().map(([time, who, text], i) => <div className="event" key={`${time}-${i}`}><time>{time}</time><div><b>{who}</b><p>{text}</p></div></div>)}</div>
          <div className="hypotheses panel"><div className="panel-head"><span>HYPOTHESES</span><small>UPDATED CONTINUOUSLY</small></div>{hypotheses.map(([name, score, level]) => <div className="hyp" key={name}><div><span>{name}</span><b>{score}%</b></div><div className="bar"><i style={{ width: `${score}%` }} /></div><small>{level}</small></div>)}</div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
