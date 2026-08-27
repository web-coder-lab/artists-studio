/** Shared WebRTC helper for Artist's Studio calls */
(function (global) {
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  function createCallController(opts) {
    const {
      getToken,
      apiBase = '/api/v1',
      getSocket,
      sendSignal,
      onRemoteStream,
      onLocalStream,
      onStatus,
      role // 'user' | 'admin'
    } = opts;

    let pc = null;
    let localStream = null;
    let callId = null;
    let mode = 'voice';

    async function api(path, body, method = 'POST') {
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() };
      const res = await fetch(apiBase + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Call API failed');
      return data;
    }

    async function ensureMedia(video) {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
      }
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: !!video
      });
      onLocalStream && onLocalStream(localStream);
      return localStream;
    }

    function setupPc() {
      cleanupPc(false);
      pc = new RTCPeerConnection(ICE);
      pc.onicecandidate = (e) => {
        if (e.candidate && callId) {
          sendSignal({ type: 'candidate', candidate: e.candidate });
        }
      };
      pc.ontrack = (e) => {
        onRemoteStream && onRemoteStream(e.streams[0]);
      };
      if (localStream) {
        localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      }
    }

    async function handleSignal(msg) {
      if (!msg || +msg.call_id !== +callId) return;
      const s = msg.signal;
      if (!s) return;
      try {
        if (s.type === 'offer') {
          setupPc();
          await pc.setRemoteDescription(s.offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: 'answer', answer });
          onStatus && onStatus('active');
        } else if (s.type === 'answer') {
          if (pc) await pc.setRemoteDescription(s.answer);
          onStatus && onStatus('active');
        } else if (s.type === 'candidate' && s.candidate && pc) {
          try { await pc.addIceCandidate(s.candidate); } catch (_) {}
        }
      } catch (e) {
        console.error('signal', e);
      }
    }

    async function userStart(callMode) {
      mode = callMode;
      onStatus && onStatus('calling');
      await ensureMedia(mode === 'video');
      const { call } = await api('/calls', { mode });
      callId = call.id;
      setupPc();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: 'offer', offer });
      return call;
    }

    async function adminAccept(id, callMode) {
      callId = id;
      mode = callMode || 'voice';
      onStatus && onStatus('connecting');
      await ensureMedia(mode === 'video');
      setupPc();
      await api('/calls/' + id + '/accept');
      // wait for offer via signal
      return id;
    }

    async function reject(id) {
      await api('/calls/' + id + '/reject');
      cleanup();
    }

    async function end() {
      if (callId) {
        try { await api('/calls/' + callId + '/end'); } catch (_) {}
      }
      cleanup();
      onStatus && onStatus('ended');
    }

    function cleanupPc(stopMedia) {
      if (pc) {
        try { pc.close(); } catch (_) {}
        pc = null;
      }
      if (stopMedia && localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
      }
    }

    function cleanup() {
      cleanupPc(true);
      callId = null;
    }

    function toggleMute() {
      if (!localStream) return false;
      const t = localStream.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; return !t.enabled; }
      return false;
    }

    function toggleCamera() {
      if (!localStream) return false;
      const t = localStream.getVideoTracks()[0];
      if (t) { t.enabled = !t.enabled; return !t.enabled; }
      return false;
    }

    return {
      userStart,
      adminAccept,
      reject,
      end,
      handleSignal,
      toggleMute,
      toggleCamera,
      getCallId: () => callId,
      setCallId: (id) => { callId = id; }
    };
  }

  global.StudioCall = { createCallController };
})(window);
