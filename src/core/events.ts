export type GameEventMap = {
  notification: { title: string; message: string; tone: "info" | "good" | "warning" | "danger" };
  alarmRaised: { incidentId: string };
  monthEnded: { month: number; year: number };
  scenarioEnded: { result: "won" | "lost" };
  stateChanged: undefined;
};

type Listener<T> = (payload: T) => void;

export class EventBus {
  private readonly listeners = new Map<keyof GameEventMap, Set<Listener<never>>>();

  on<K extends keyof GameEventMap>(type: K, listener: Listener<GameEventMap[K]>): () => void {
    const bucket = this.listeners.get(type) ?? new Set<Listener<never>>();
    bucket.add(listener as Listener<never>);
    this.listeners.set(type, bucket);
    return () => bucket.delete(listener as Listener<never>);
  }

  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void {
    this.listeners.get(type)?.forEach((listener) => listener(payload as never));
  }
}
