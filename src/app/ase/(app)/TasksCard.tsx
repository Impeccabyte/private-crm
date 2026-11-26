"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createTask, toggleTask } from "./actions";
import { ActionForm } from "@/components/forms";

type T = { id: string; title: string; detail: string; due: string | null; done: boolean };

export function TasksCard({ tasks, openNew }: { tasks: T[]; openNew?: boolean }) {
  const [adding, setAdding] = useState(!!openNew);
  const [optimistic, setOpt] = useOptimistic(tasks, (state, u: { id: string; done: boolean }) => state.map((t) => (t.id === u.id ? { ...t, done: u.done } : t)));
  const [, start] = useTransition();
  const open = optimistic.filter((t) => !t.done).length;
  const now = Date.now();
  return (
    <section className="card" aria-labelledby="task-h">
      <div className="card-h">
        <h2 id="task-h">My tasks today <span className="ct">{open}</span></h2>
        <button className="btn ghost sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}><Plus size={14} aria-hidden="true" />Add</button>
      </div>
      {adding && (
        <div className="expand-in" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
          <ActionForm action={createTask} submitLabel="Add task" className="stack" resetOnOk>
            <div className="field"><label htmlFor="task-title">Task</label><input id="task-title" name="title" className="inp" autoFocus placeholder="e.g. Call back about pricing" /></div>
            <div className="field"><label htmlFor="task-due">Due</label><input id="task-due" name="due" type="date" className="inp" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
          </ActionForm>
        </div>
      )}
      {optimistic.length === 0 && <div className="card-b subtle">No tasks due today.</div>}
      {optimistic.map((t) => {
        const overdue = !t.done && t.due && new Date(t.due).getTime() < now - 60_000 && new Date(t.due).toDateString() !== new Date().toDateString();
        return (
          <div key={t.id} className={`task ${t.done ? "done" : ""}`}>
            <input type="checkbox" id={`task-${t.id}`} checked={t.done} onChange={(e) => {
              const done = e.target.checked;
              start(async () => { setOpt({ id: t.id, done }); await toggleTask(t.id, done); });
            }} />
            <label htmlFor={`task-${t.id}`} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
              <span className="tt" style={{ display: "block", fontWeight: 500 }}>{t.title}</span>
              {t.detail && <span className="subtle sm" style={{ display: "block" }}>{t.detail}</span>}
            </label>
            <span className={`sm ${overdue ? "tx-red" : "subtle"}`}>{overdue ? "Overdue" : t.due ? new Date(t.due).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
          </div>
        );
      })}
    </section>
  );
}
