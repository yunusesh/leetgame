export function MissionPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Why I built leetgame</h1>
        <p className="text-muted-foreground mb-8">
          A different way to practice algorithms — no IDE, no typing, just thinking out loud.
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Writing code is a crutch</h2>
          <p className="text-sm leading-relaxed mb-3">
            When you practice by writing code, you can get away with half-understanding the problem. You type something, run it, tweak it, and eventually it passes. But you never had to fully articulate what you were doing or why. That gap doesn't show up until an interview, when someone asks you to explain your approach and you realize you can't.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame removes the crutch. There's no code to write — just a problem and a prompt to describe your approach in plain English. If you can explain it clearly, you understand it. If you can't, you don't. It's a harder test, and a more honest one.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Pattern recognition is the actual skill</h2>
          <p className="text-sm leading-relaxed mb-3">
            Most LeetCode problems aren't novel puzzles. They're applications of a small set of patterns — sliding window, BFS, dynamic programming, two pointers. Once you recognize which pattern applies, the rest is mechanics.
          </p>
          <p className="text-sm leading-relaxed">
            The part most people skip is drilling recognition itself. They memorize solutions, not patterns. leetgame focuses on that recognition step in isolation — see the problem, name the pattern, explain why it fits — so when you encounter something new, you're identifying the approach before you've even thought about code.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Practice should fit into your life</h2>
          <p className="text-sm leading-relaxed mb-3">
            A coding environment needs a laptop, a quiet space, and a chunk of uninterrupted time. That's a high bar. Most days, the conditions are never quite right, so you don't practice.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame works on your phone, takes a few minutes per problem, and fits into dead time — a commute, a lunch break, five minutes between meetings. Lower friction means you actually practice instead of waiting for the perfect conditions that never come.
          </p>
        </section>
      </div>
    </div>
  )
}
