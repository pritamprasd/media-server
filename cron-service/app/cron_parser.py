"""Parse cron expressions into human-readable text and next run times."""

from datetime import datetime, timedelta, timezone


DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _expand_field(field, low, high):
    """Expand a cron field (including *, ranges, steps, lists) into a sorted set of ints."""
    values = set()
    for part in field.split(","):
        part = part.strip()
        if "/" in part:
            base, step = part.split("/", 1)
            step = int(step)
            if base == "*":
                start = low
            elif "-" in base:
                start = int(base.split("-")[0])
            else:
                start = int(base)
            for v in range(start, high + 1, step):
                values.add(v)
        elif "-" in part:
            a, b = part.split("-", 1)
            for v in range(int(a), int(b) + 1):
                values.add(v)
        elif part == "*":
            for v in range(low, high + 1):
                values.add(v)
        else:
            values.add(int(part))
    return sorted(values)


def parse(expr):
    """Parse a 5-field cron expression into human-readable text.

    Returns dict with 'human' (str) and 'next_runs' (list of datetime).
    """
    parts = expr.strip().split()
    if len(parts) != 5:
        return {"human": "Invalid expression (expected 5 fields)", "next_runs": []}

    minute_f, hour_f, day_f, month_f, dow_f = parts

    minutes = _expand_field(minute_f, 0, 59)
    hours = _expand_field(hour_f, 0, 23)
    days = _expand_field(day_f, 1, 31)
    months = _expand_field(month_f, 1, 12)
    dows = _expand_field(dow_f, 0, 6)

    # Build human-readable text
    time_str = ""
    if minute_f == "*" and hour_f == "*":
        time_str = "every minute"
    elif minute_f == "0" and hour_f == "*":
        time_str = "every hour at :00"
    elif minute_f == "0" and hour_f != "*" and len(hours) == 1:
        if hours[0] == 0:
            time_str = "at 12:00 AM"
        elif hours[0] < 12:
            time_str = f"at {hours[0]}:00 AM"
        elif hours[0] == 12:
            time_str = "at 12:00 PM"
        else:
            time_str = f"at {hours[0] - 12}:00 PM"
    elif minute_f != "*" and hour_f != "*" and len(hours) == 1 and len(minutes) == 1:
        h = hours[0]
        m = minutes[0]
        if h == 0:
            time_str = f"at 12:{m:02d} AM"
        elif h < 12:
            time_str = f"at {h}:{m:02d} AM"
        elif h == 12:
            time_str = f"at 12:{m:02d} PM"
        else:
            time_str = f"at {h - 12}:{m:02d} PM"
    elif minute_f != "*" and hour_f != "*":
        time_str = f"at {hour_f}:{minute_f.zfill(2)}"
    elif minute_f == "0":
        time_str = f"every hour"
    else:
        time_str = f"every {minute_f} minutes"

    # Day/month/dow context
    context = ""
    if day_f == "*" and month_f == "*" and dow_f == "*":
        context = "every day"
    elif dow_f != "*" and day_f == "*" and month_f == "*":
        if len(dows) == 1:
            context = f"every {DAYS[dows[0]]}"
        else:
            day_names = [DAYS[d] for d in dows]
            context = "every " + ", ".join(day_names[:-1]) + " and " + day_names[-1]
    elif day_f != "*" and month_f == "*" and dow_f == "*":
        if len(days) == 1:
            context = f"on day {days[0]} of every month"
        else:
            context = f"on days {', '.join(str(d) for d in days)} of every month"
    elif month_f != "*" and day_f == "*" and dow_f == "*":
        if len(months) == 1:
            context = f"every {MONTHS[months[0]]}"
        else:
            names = [MONTHS[m] for m in months]
            context = "every " + ", ".join(names[:-1]) + " and " + names[-1]
    elif day_f != "*" and month_f != "*":
        context = f"on {MONTHS[months[0]]} {days[0]}" if len(months) == 1 and len(days) == 1 else "on specific dates"
    else:
        context = "on a custom schedule"

    human = f"{time_str}, {context}".replace("every day, ", "").replace(", every day", "")

    # Calculate next runs
    now = datetime.now(timezone.utc)
    next_runs = []
    candidate = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

    for _ in range(525600):  # max 1 year of minutes
        if (
            candidate.minute in minutes
            and candidate.hour in hours
            and candidate.day in days
            and candidate.month in months
            and candidate.weekday() in dows
        ):
            next_runs.append(candidate)
            if len(next_runs) >= 5:
                break
        candidate += timedelta(minutes=1)

    return {"human": human, "next_runs": [r.isoformat() for r in next_runs]}
