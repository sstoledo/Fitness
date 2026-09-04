import { z } from "zod";

// ---------- Client -> Server ----------

export const JoinEventSchema = z.object({
  challengeId: z.string().min(1),
});
export type JoinEvent = z.infer<typeof JoinEventSchema>;

export const PositionPingEventSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ts: z.number().int().nonnegative(),
});
export type PositionPingEvent = z.infer<typeof PositionPingEventSchema>;

export const HeartbeatEventSchema = z.object({});
export type HeartbeatEvent = z.infer<typeof HeartbeatEventSchema>;

// ---------- Server -> Client ----------

export const PositionUpdateEventSchema = z.object({
  userId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ts: z.number().int().nonnegative(),
});
export type PositionUpdateEvent = z.infer<typeof PositionUpdateEventSchema>;

export const MemberJoinedEventSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
});
export type MemberJoinedEvent = z.infer<typeof MemberJoinedEventSchema>;

export const MemberStaleEventSchema = z.object({
  userId: z.string().min(1),
});
export type MemberStaleEvent = z.infer<typeof MemberStaleEventSchema>;

// ---------- Event name constants ----------

export const SocketEvents = {
  // Client -> Server
  Join: "join",
  PositionPing: "position:ping",
  Heartbeat: "heartbeat",
  // Server -> Client
  PositionUpdate: "position:update",
  MemberJoined: "member:joined",
  MemberStale: "member:stale",
} as const;
export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
