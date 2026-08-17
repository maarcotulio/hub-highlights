"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

const MIN_DAYS_OFF = 0;
const MAX_DAYS_OFF = 30;

export function StreakSettingsPanel({
  initialMaxConsecutiveDaysOff,
}: {
  initialMaxConsecutiveDaysOff: number;
}) {
  const [value, setValue] = useState(String(initialMaxConsecutiveDaysOff));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxConsecutiveDaysOff = Number(value);
  const isValid =
    value.trim() !== "" &&
    Number.isInteger(maxConsecutiveDaysOff) &&
    maxConsecutiveDaysOff >= MIN_DAYS_OFF &&
    maxConsecutiveDaysOff <= MAX_DAYS_OFF;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid || saving) {
      setError("Choose a whole number from 0 to 30.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const response = await fetch("/api/settings/streak", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxConsecutiveDaysOff }),
      });
      if (!response.ok) {
        setError("Couldn't save your streak setting. Try again.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Couldn't save your streak setting. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-border rounded-xl p-6 bg-surface-2 flex flex-col gap-5 max-w-xl"
    >
      <div className="text-sm text-text-2 leading-relaxed">
        Keep a reading streak through a planned break. This is the maximum number of
        consecutive UTC calendar days you can skip between reading days.
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="max-consecutive-days-off" className="text-xs font-mono text-text-2">
          DAYS OFF ALLOWED
        </label>
        <input
          id="max-consecutive-days-off"
          type="number"
          min={MIN_DAYS_OFF}
          max={MAX_DAYS_OFF}
          step="1"
          inputMode="numeric"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
            setError(null);
          }}
          aria-describedby="days-off-help"
          className="max-w-32 font-mono text-sm px-3.5 py-2.5 rounded-lg border border-border bg-surface"
        />
        <span id="days-off-help" className="text-xs text-text-2">
          0 means you need to read every day. Choose up to 30 days.
        </span>
      </div>

      {error && <span className="text-sm text-danger">{error}</span>}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="ghost" disabled={saving}>
          {saving ? "Saving…" : "Save streak setting"}
        </Button>
        {saved && <span className="text-xs text-text-2">Saved.</span>}
      </div>
    </form>
  );
}
