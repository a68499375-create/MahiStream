import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/client";
import { DAYS } from "../lib/types";
import Shell from "../components/Shell";
import { CalendarIcon, ClockIcon } from "../components/icons";

export default function SchedulePage() {
  const [sched, setSched] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/schedule").then(d => setSched(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const byDay = DAYS.map(day => ({
    day,
    items: sched.filter(s => s.day === day || s.day_of_week === day)
  }));

  return (
    <Shell>
      <div className="mt-4 flex items-center gap-2">
        <CalendarIcon size={20} className="text-accent" />
        <h1 className="text-lg font-extrabold text-ink">Jadwal Rilis</h1>
      </div>
      <p className="mt-1 text-xs text-muted">Jadwal tayang anime setiap harinya</p>

      {loading ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {byDay.map(({ day, items }) => (
            <div key={day}>
              <h2 className="mb-2 text-sm font-bold text-accent uppercase tracking-wide">{day}</h2>
              {items.length === 0 ? (
                <p className="text-xs text-muted2">Tidak ada jadwal</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(s => (
                    <Link key={s.id} to={s.anime_id ? `/anime/${s.anime_id}` : "/browse"}
                      className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-accent/50">
                      {s.poster ? (
                        <img src={s.poster} alt="" className="h-14 w-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-xs text-muted">?</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-semibold text-ink">{s.title}</p>
                        {s.time && (
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-accent2">
                            <ClockIcon size={11} />{s.time}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
