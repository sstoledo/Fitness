import { describe, expect, it } from "vitest";

import {
  HeartbeatEventSchema,
  JoinEventSchema,
  MemberJoinedEventSchema,
  MemberStaleEventSchema,
  PositionPingEventSchema,
  PositionUpdateEventSchema,
  SocketEvents,
} from "./socket-events";

describe("client -> server events", () => {
  it("join accepts a challengeId and rejects empty payload", () => {
    expect(JoinEventSchema.safeParse({ challengeId: "c1" }).success).toBe(true);
    expect(JoinEventSchema.safeParse({}).success).toBe(false);
  });

  it("position:ping round-trips and validates ranges", () => {
    const payload = { lat: -34.6, lng: -58.4, ts: 1788547200000 };
    expect(PositionPingEventSchema.safeParse(payload).success).toBe(true);
    expect(PositionPingEventSchema.safeParse({ ...payload, lat: 91 }).success).toBe(false);
    expect(PositionPingEventSchema.safeParse({ ...payload, lng: 181 }).success).toBe(false);
    expect(PositionPingEventSchema.safeParse({ lat: 0, lng: 0, ts: -1 }).success).toBe(false);
  });

  it("heartbeat accepts an empty payload", () => {
    expect(HeartbeatEventSchema.safeParse({}).success).toBe(true);
  });
});

describe("server -> client events", () => {
  it("position:update round-trips and rejects invalid coordinates", () => {
    const payload = { userId: "u1", lat: -34.6, lng: -58.4, ts: 1788547200000 };
    expect(PositionUpdateEventSchema.safeParse(payload).success).toBe(true);
    expect(PositionUpdateEventSchema.safeParse({ ...payload, lat: -91 }).success).toBe(false);
    expect(PositionUpdateEventSchema.safeParse({ ...payload, userId: "" }).success).toBe(false);
  });

  it("member:joined requires userId and name", () => {
    expect(MemberJoinedEventSchema.safeParse({ userId: "u1", name: "Ada" }).success).toBe(true);
    expect(MemberJoinedEventSchema.safeParse({ userId: "u1" }).success).toBe(false);
  });

  it("member:stale requires userId", () => {
    expect(MemberStaleEventSchema.safeParse({ userId: "u1" }).success).toBe(true);
    expect(MemberStaleEventSchema.safeParse({}).success).toBe(false);
  });
});

describe("SocketEvents constants", () => {
  it("exposes stable event names", () => {
    expect(SocketEvents.Join).toBe("join");
    expect(SocketEvents.PositionPing).toBe("position:ping");
    expect(SocketEvents.Heartbeat).toBe("heartbeat");
    expect(SocketEvents.PositionUpdate).toBe("position:update");
    expect(SocketEvents.MemberJoined).toBe("member:joined");
    expect(SocketEvents.MemberStale).toBe("member:stale");
  });
});
