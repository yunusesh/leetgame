export function MissionPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Why I built leetgame</h1>
        <p className="text-muted-foreground mb-8">
          A verbal pattern recognition drill for people preparing for coding interviews — no IDE, no typing, just thinking out loud.
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">LeetCode tests whether you can implement. This tests whether you understand.</h2>
          <p className="text-sm leading-relaxed">
            Coding up a full solution takes 30–45 minutes. A verbal explanation takes 3–5. That 10x speed difference means more reps per session, more problems seen, and more pattern intuition built. leetgame isn't a replacement for LeetCode — it's what you do after you've put in the reps and want to make sure you actually understand what you practiced.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">The gap interviews expose</h2>
          <p className="text-sm leading-relaxed mb-3">
            Most people can recognize a solution when they see it. Fewer can explain <em>why</em> sliding window applies, <em>why</em> the complexity is O(n), <em>why</em> a greedy approach is correct. That gap is what interviews probe — and what most practice methods don't address.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame drills pattern recognition and articulation in isolation — see the problem, name the pattern, explain why it fits, walk through the algorithm. An AI evaluates your reasoning and pushes back when it's incomplete. Explaining something clearly forces you to actually understand it, and that understanding is exactly what interviewers are looking for.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Practice should fit into your life</h2>
          <p className="text-sm leading-relaxed mb-3">
            A coding environment needs a laptop, a quiet space, and a chunk of uninterrupted time. That's a high bar. Most days the conditions are never quite right, so you don't practice.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame works on your phone, takes a few minutes per problem, and fits into dead time — a commute, a lunch break, five minutes between meetings. Lower friction means you actually practice instead of waiting for the perfect conditions that never come.
          </p>
        </section>
      </div>
    </div>
  )
}
