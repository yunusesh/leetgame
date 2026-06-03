export function MissionPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">leetgame — mission</h1>
        <p className="text-muted-foreground mb-8">
          A verbal pattern recognition drill for people preparing for coding interviews.
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">LeetCode tests whether you can implement. This tests whether you understand.</h2>
          <p className="text-sm leading-relaxed mb-3">
            Coding up a full solution takes 30–45 minutes. A verbal explanation takes 3–5. That 10x speed difference means more reps per session — and more reps means better recall and better pattern transfer.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame is not a replacement for LeetCode. It's a complement to it — for people who have already done the problems and want to drill recall and articulation before an interview.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">The gap interviews expose</h2>
          <p className="text-sm leading-relaxed mb-3">
            Most people can recognize a solution when they see it. Fewer can explain <em>why</em> sliding window applies, <em>why</em> the complexity is O(n), <em>why</em> a greedy approach is correct. That gap is what interviews probe.
          </p>
          <p className="text-sm leading-relaxed">
            Forced articulation is the mechanic. Explaining something out loud — to an LLM that pushes back when your reasoning is incomplete — is a different kind of practice than typing code. It's the kind that closes the gap.
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
