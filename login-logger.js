/* Login Logger — tracking des sessions en mémoire + persist optionnel */
const sessions = new Map();
let nextId = 1;

function nowISO() { return new Date().toISOString(); }

module.exports = {
  startSession(email, data = {}) {
    const id = String(nextId++);
    const session = {
      id, email,
      startTime: nowISO(),
      endTime: null,
      status: 'running',
      steps: [],
      errors: [],
      ...data
    };
    sessions.set(id, session);
    return {
      id,
      logStep(step, d) {
        const s = sessions.get(id);
        if (s) { s.steps.push({ step, time: nowISO(), ...d }); }
      },
      addError(err, ctx = {}) {
        const s = sessions.get(id);
        if (s) {
          s.errors.push({ error: err.message || err, time: nowISO(), ...ctx });
          s.status = 'error';
        }
      }
    };
  },

  endSession(id) {
    const s = sessions.get(id);
    if (!s) return;
    s.endTime = nowISO();
    if (s.status === 'running') s.status = 'success';
  },

  getAllSessions(limit = 100) {
    return Array.from(sessions.values())
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      .slice(0, limit);
  },

  getSessionsByEmail(email) {
    return Array.from(sessions.values())
      .filter(s => s.email === email)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  },

  getStats() {
    const all = Array.from(sessions.values());
    const todayStr = new Date().toISOString().slice(0, 10);
    const today = all.filter(s => s.startTime && s.startTime.startsWith(todayStr)).length;
    const success = all.filter(s => s.status === 'success').length;
    const error = all.filter(s => s.status === 'error').length;
    const running = all.filter(s => s.status === 'running').length;
    const recentErrors = all
      .filter(s => s.errors && s.errors.length > 0)
      .flatMap(s => s.errors.map(e => ({ email: s.email, time: e.time, error: e.error })))
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 10);
    return { total: all.length, success, error, running, today, recentErrors };
  },

  cleanup() {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 jours
    for (const [id, s] of sessions) {
      if (s.startTime && new Date(s.startTime).getTime() < cutoff) sessions.delete(id);
    }
  }
};
