export function MissionPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Why I built leetgame</h1>
        <p className="text-muted-foreground mb-6">
          A different way to practice algorithms — no IDE, no typing, just thinking out loud.
        </p>

        <ul className="text-sm text-muted-foreground space-y-1 mb-8 list-none">
          <li>— Articulation and understanding are what interviews actually test</li>
          <li>— Pattern recognition is a skill you can drill separately</li>
          <li>— Practice should fit into your life, not require ideal conditions</li>
        </ul>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Interviews test articulation, not just code</h2>
          <p className="text-sm leading-relaxed mb-3">
            In a real interview, you're expected to talk through your thinking — explain the approach, justify the tradeoffs, describe the complexity. That's a different skill from implementing an algorithm, and most people don't practice it explicitly.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame is built around that skill. There's no code to write — just a problem and a prompt to describe your approach in plain English. Explaining something clearly forces you to actually understand it, and that understanding is exactly what interviewers are looking for.
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
