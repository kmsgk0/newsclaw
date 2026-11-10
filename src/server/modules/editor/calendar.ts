const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function businessDate(value = new Date()): string {
  return dateFormatter.format(value);
}

export function dayBounds(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00:00+08:00`);
  return { from: start.toISOString(), to: new Date(start.valueOf() + 86_400_000).toISOString() };
}
