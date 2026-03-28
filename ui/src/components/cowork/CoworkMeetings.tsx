import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, CalendarPlus } from "lucide-react";
import { useCoworkStore } from "../../stores/coworkStore.js";
import MeetingCard from "./MeetingCard.js";
import Modal from "../shared/Modal.js";
import Input from "../shared/Input.js";
import Button from "../shared/Button.js";

export default function CoworkMeetings() {
  const { t } = useTranslation();
  const { meetings, loadMeetings, createMeeting, completeMeeting, deleteMeeting, extractActions } = useCoworkStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showExtract, setShowExtract] = useState<string | null>(null);
  const [extractText, setExtractText] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [participants, setParticipants] = useState("");

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  // Listen for quick action
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === "new-meeting") {
        setShowCreate(true);
      }
    };
    window.addEventListener("cowork:quick-action", handler);
    return () => window.removeEventListener("cowork:quick-action", handler);
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !date || !time) return;
    const scheduledAt = new Date(`${date}T${time}`).getTime();
    const participantList = participants.split(",").map((p) => p.trim()).filter(Boolean);
    await createMeeting({
      title: title.trim(),
      scheduledAt,
      duration: Number(duration) * 60000,
      participants: participantList,
    });
    setTitle("");
    setDate("");
    setTime("");
    setDuration("60");
    setParticipants("");
    setShowCreate(false);
  };

  const handleExtract = async () => {
    if (!showExtract || !extractText.trim()) return;
    await extractActions(showExtract, extractText);
    setExtractText("");
    setShowExtract(null);
  };

  const upcoming = meetings.filter((m) => m.status !== "completed");
  const completed = meetings.filter((m) => m.status === "completed");

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("cowork.meetings.title", "Reunioes")}
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 transition-colors cursor-pointer"
        >
          <Plus size={14} />
          {t("cowork.meetings.new", "Nova Reuniao")}
        </button>
      </div>

      {upcoming.length === 0 && completed.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <CalendarPlus size={32} className="text-text-secondary/50" />
          <p className="text-sm text-text-secondary">
            {t("cowork.meetings.empty", "Nenhuma reuniao agendada")}
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t("cowork.meetings.upcoming", "Proximas")}
          </p>
          {upcoming.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              expanded
              onComplete={() => completeMeeting(meeting.id)}
              onDelete={() => deleteMeeting(meeting.id)}
              onExtractActions={() => setShowExtract(meeting.id)}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t("cowork.meetings.completed", "Concluidas")}
          </p>
          {completed.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} expanded />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title={t("cowork.meetings.newTitle", "Nova Reuniao")} onClose={() => setShowCreate(false)}>
          <div className="space-y-3">
            <Input placeholder={t("cowork.meetings.titlePlaceholder", "Titulo da reuniao")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary" />
            </div>
            <Input placeholder={t("cowork.meetings.durationPlaceholder", "Duracao (minutos)")} value={duration} onChange={(e) => setDuration(e.target.value)} />
            <Input placeholder={t("cowork.meetings.participantsPlaceholder", "Participantes (separados por virgula)")} value={participants} onChange={(e) => setParticipants(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>{t("common.cancel", "Cancelar")}</Button>
              <Button onClick={handleCreate}>{t("common.create", "Criar")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Extract actions modal */}
      {showExtract && (
        <Modal title={t("cowork.meetings.extractTitle", "Extrair Action Items")} onClose={() => setShowExtract(null)}>
          <div className="space-y-3">
            <p className="text-xs text-text-secondary">
              {t("cowork.meetings.extractHint", "Cole as notas da reuniao. Itens com - ou * serao extraidos como tarefas.")}
            </p>
            <textarea
              value={extractText}
              onChange={(e) => setExtractText(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-xs text-text-primary resize-none"
              placeholder="- Preparar relatorio Q1&#10;- Enviar proposta para cliente&#10;- Agendar follow-up com equipe"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowExtract(null)}>{t("common.cancel", "Cancelar")}</Button>
              <Button onClick={handleExtract}>{t("cowork.meetings.extractBtn", "Extrair Tarefas")}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
