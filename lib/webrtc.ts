// Thin wrapper around RTCPeerConnection for 1:1 calls. Signaling (offer/answer/
// ICE exchange) is handled by the caller via Supabase broadcast — this class
// only owns the peer connection and local media.

import { createClient } from "@/lib/supabase/client";

// STUN alone covers same-network calls. Cross-network calls (different Wi-Fi/
// cellular, symmetric NAT) need a TURN relay — fetched from the `turn` Supabase
// Edge Function so the Metered key never reaches the browser.
const STUN_ONLY: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/** Fetch ICE servers (STUN + TURN) from the edge function. Falls back to
 *  STUN-only if it's unreachable or not deployed. */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const { data, error } = await createClient().functions.invoke("turn", { method: "GET" });
    if (error) throw error;
    const servers = data as RTCIceServer[];
    return Array.isArray(servers) && servers.length ? servers : STUN_ONLY;
  } catch {
    return STUN_ONLY;
  }
}

export class PeerSession {
  pc: RTCPeerConnection;
  localStream: MediaStream | null = null;
  onRemoteStream?: (s: MediaStream) => void;
  onIce?: (c: RTCIceCandidateInit) => void;

  // ICE candidates can arrive before the remote description is set — buffer
  // them and flush once it is, otherwise addIceCandidate throws.
  private remoteSet = false;
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(iceServers: RTCIceServer[] = STUN_ONLY) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.ontrack = (e) => this.onRemoteStream?.(e.streams[0]);
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.onIce?.(e.candidate.toJSON());
    };
  }

  /** Grab camera + mic and attach them. Tolerates a denied permission prompt —
   *  the call still connects, just receive-only. */
  async start(): Promise<MediaStream | null> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.localStream
        .getTracks()
        .forEach((t) => this.pc.addTrack(t, this.localStream!));
    } catch {
      this.localStream = null;
      // No local media — still negotiate so we can receive the other side.
      this.pc.addTransceiver("video", { direction: "recvonly" });
      this.pc.addTransceiver("audio", { direction: "recvonly" });
    }
    return this.localStream;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(offer);
    await this.flushIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(answer);
    await this.flushIce();
  }

  async addIce(c: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteSet) {
      this.pendingIce.push(c);
      return;
    }
    try {
      await this.pc.addIceCandidate(c);
    } catch {
      // Stray candidate after teardown — safe to ignore.
    }
  }

  private async flushIce(): Promise<void> {
    this.remoteSet = true;
    for (const c of this.pendingIce) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {}
    }
    this.pendingIce = [];
  }

  close(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.close();
  }
}
