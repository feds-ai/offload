import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Mic, MicOff, Image, Send, X, Loader2, Link } from "lucide-react";
import TaskProcessingModal from "./TaskProcessingModal";
import { useHousehold } from "@/contexts/HouseholdContext";

interface InputBarProps {
  onTasksAdded?: () => void;
}

type InputMode = "text" | "image" | "voice" | "url";

export default function InputBar({ onTasksAdded }: InputBarProps) {
  const { household } = useHousehold();
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const extractFromText = trpc.extract.fromText.useMutation();
  const extractFromImage = trpc.extract.fromImage.useMutation();
  const extractFromVoice = trpc.extract.fromVoice.useMutation();

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Image must be under 16 MB");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
      };
      mr.start();
      setRecording(true);
      setAudioDuration(0);
      timerRef.current = setInterval(() => setAudioDuration((d) => d + 1), 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function clearVoice() {
    setAudioBlob(null);
    setAudioDuration(0);
  }

  async function handleSubmit() {
    if (!household) {
      toast.error("No household found");
      return;
    }
    setProcessing(true);
    try {
      let result: any;
      if (mode === "text" || mode === "url") {
        const inputText = mode === "url" ? `URL: ${urlInput}\n${text}` : text;
        if (!inputText.trim()) { toast.error("Please enter some text"); return; }
        result = await extractFromText.mutateAsync({ householdId: household.id, text: inputText });
      } else if (mode === "image" && imageFile) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((res, rej) => {
          reader.onload = (e) => {
            const b64 = (e.target?.result as string).split(",")[1];
            res(b64 ?? "");
          };
          reader.onerror = rej;
          reader.readAsDataURL(imageFile);
        });
        result = await extractFromImage.mutateAsync({
          householdId: household.id,
          imageBase64: base64,
          mimeType: imageFile.type,
        });
      } else if (mode === "voice" && audioBlob) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((res, rej) => {
          reader.onload = (e) => {
            const b64 = (e.target?.result as string).split(",")[1];
            res(b64 ?? "");
          };
          reader.onerror = rej;
          reader.readAsDataURL(audioBlob);
        });
        result = await extractFromVoice.mutateAsync({
          householdId: household.id,
          audioBase64: base64,
          mimeType: "audio/webm",
        });
      } else {
        toast.error("Nothing to process");
        return;
      }
      setExtractionResult(result);
      setModalOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Extraction failed");
    } finally {
      setProcessing(false);
    }
  }

  function handleModalConfirm() {
    setModalOpen(false);
    setText("");
    setImageFile(null);
    setImagePreview(null);
    setAudioBlob(null);
    setUrlInput("");
    setExtractionResult(null);
    onTasksAdded?.();
  }

  const canSubmit =
    !processing &&
    household &&
    ((mode === "text" && text.trim()) ||
      (mode === "url" && urlInput.trim()) ||
      (mode === "image" && imageFile) ||
      (mode === "voice" && audioBlob));

  return (
    <>
      <div className="bg-card border border-border rounded-2xl shadow-sm p-4 space-y-3">
        {/* Mode tabs */}
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {(["text", "image", "voice", "url"] as InputMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "url" ? "URL" : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Text input */}
        {mode === "text" && (
          <Textarea
            placeholder="Paste a school notice, party invite, or anything on your mind..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[80px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
          />
        )}

        {/* URL input */}
        {mode === "url" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Link className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="url"
                placeholder="https://..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <Textarea
              placeholder="Optional: add any extra context..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
            />
          </div>
        )}

        {/* Image input */}
        {mode === "image" && (
          <div>
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full max-h-40 object-cover rounded-lg"
                />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl py-8 text-center text-sm text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <Image className="w-6 h-6 mx-auto mb-2 opacity-50" />
                Tap to upload a photo or screenshot
                <br />
                <span className="text-xs opacity-60">School notices, letters, invites...</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>
        )}

        {/* Voice input */}
        {mode === "voice" && (
          <div className="flex flex-col items-center gap-3 py-2">
            {audioBlob ? (
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium">
                  🎙️ Recording ready ({audioDuration}s)
                </div>
                <button onClick={clearVoice} className="text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : recording ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-sm text-red-600 font-medium animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  Recording... {audioDuration}s
                </div>
                <Button variant="outline" size="sm" onClick={stopRecording}>
                  <MicOff className="w-4 h-4 mr-1.5" />
                  Stop recording
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Button variant="outline" size="lg" onClick={startRecording} className="rounded-full w-16 h-16 p-0">
                  <Mic className="w-6 h-6" />
                </Button>
                <p className="text-xs text-muted-foreground">Tap to record a voice note</p>
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            size="sm"
            className="rounded-xl px-5"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-1.5" />
                Offload it
              </>
            )}
          </Button>
        </div>
      </div>

      <TaskProcessingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        result={extractionResult}
        onConfirm={handleModalConfirm}
      />
    </>
  );
}
