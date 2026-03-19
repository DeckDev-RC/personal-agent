type SpeechCallback = (transcript: string, isFinal: boolean) => void;

let recognition: any = null;
let isListening = false;

export function isSpeechSupported(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      (window.SpeechRecognition || (window as any).webkitSpeechRecognition),
  );
}

export function startRecognition(
  onResult: SpeechCallback,
  onEnd: () => void,
  lang?: string,
): boolean {
  if (!isSpeechSupported()) return false;
  if (isListening) {
    stopRecognition();
  }

  const SpeechRecognition =
    window.SpeechRecognition || (window as any).webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang ?? "en-US";

  recognition.onresult = (event: any) => {
    let interimTranscript = "";
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }
    if (finalTranscript) {
      onResult(finalTranscript, true);
    } else if (interimTranscript) {
      onResult(interimTranscript, false);
    }
  };

  recognition.onerror = () => {
    isListening = false;
    onEnd();
  };

  recognition.onend = () => {
    isListening = false;
    onEnd();
  };

  recognition.start();
  isListening = true;
  return true;
}

export function stopRecognition(): void {
  if (recognition && isListening) {
    recognition.stop();
    isListening = false;
    recognition = null;
  }
}

export function getIsListening(): boolean {
  return isListening;
}
