import React, { useEffect, useState } from "react";
import { Plus, Play, Square, Pencil, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useWorkflowStore, type Workflow } from "../../stores/workflowStore";
import Button from "../shared/Button";
import Badge from "../shared/Badge";
import WorkflowEditor from "./WorkflowEditor";

const api = () => (window as any).codexAgent;

function StepStatusBadge({ status }: { status: "pending" | "running" | "success" | "error" | "skipped" }) {
  if (status === "running") return <Badge color="blue">running</Badge>;
  if (status === "success") return <Badge color="green">success</Badge>;
  if (status === "error") return <Badge color="red">error</Badge>;
  if (status === "skipped") return <Badge color="orange">skipped</Badge>;
  return <Badge color="gray">pending</Badge>;
}

export default function WorkflowListView() {
  const {
    workflows,
    loaded,
    loadWorkflows,
    deleteWorkflow,
    runWorkflow,
    abortWorkflow,
    runState,
    handleProgress,
    handleDone,
    handleError,
  } = useWorkflowStore();
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loaded) loadWorkflows();
  }, [loaded, loadWorkflows]);

  useEffect(() => {
    const unsubs = [
      api().onWorkflowProgress((payload: any) => handleProgress(payload)),
      api().onWorkflowDone((payload: any) => handleDone(payload)),
      api().onWorkflowError((payload: any) => handleError(payload)),
    ];
    return () => unsubs.forEach((unsub: () => void) => unsub());
  }, [handleProgress, handleDone, handleError]);

  if (editing || creating) {
    return (
      <WorkflowEditor
        workflow={editing ?? undefined}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-text-primary">Workflows</h1>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} />
            Criar workflow
          </Button>
        </div>

        {workflows.length === 0 ? (
          <div className="text-center py-12 text-text-secondary text-sm">
            Nenhum workflow criado
          </div>
        ) : (
          <div className="grid gap-3">
            {workflows.map((workflow) => {
              const isRunning = runState?.workflowId === workflow.id && runState.running;
              return (
                <div key={workflow.id} className="rounded-xl border border-border bg-bg-secondary p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {workflow.name}
                        </span>
                        <Badge color="gray">{workflow.steps.length} steps</Badge>
                        {isRunning && <Badge color="blue">running</Badge>}
                      </div>
                      {workflow.description && (
                        <p className="mt-1 text-xs text-text-secondary">{workflow.description}</p>
                      )}
                      {Object.keys(workflow.variables).length > 0 && (
                        <p className="mt-1.5 text-[10px] text-text-secondary/50 font-mono truncate">
                          {Object.entries(workflow.variables)
                            .map(([key, value]) => `${key}=${value}`)
                            .join(" | ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isRunning ? (
                        <button
                          onClick={() => abortWorkflow()}
                          className="p-1.5 rounded-lg text-accent-orange hover:bg-accent-orange/10 cursor-pointer"
                        >
                          <Square size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => runWorkflow(workflow.id)}
                          className="p-1.5 rounded-lg text-accent-green hover:bg-accent-green/10 cursor-pointer"
                        >
                          <Play size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setEditing(workflow)}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 cursor-pointer"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteWorkflow(workflow.id)}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {runState?.workflowId === workflow.id && (
                    <div className="mt-4 rounded-lg border border-border bg-bg-tertiary p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {runState.running ? (
                          <>
                            <Loader2 size={14} className="animate-spin text-accent-blue" />
                            <span className="text-xs text-text-primary">Executando workflow</span>
                          </>
                        ) : runState.error ? (
                          <>
                            <AlertCircle size={14} className="text-red-400" />
                            <span className="text-xs text-red-400">{runState.error}</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={14} className="text-accent-green" />
                            <span className="text-xs text-accent-green">Workflow finalizado</span>
                          </>
                        )}
                      </div>

                      <div className="space-y-2">
                        {runState.steps.map((step) => (
                          <div key={step.stepId} className="flex items-start justify-between gap-3 rounded-lg bg-bg-primary/60 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-text-primary font-medium">{step.stepId}</div>
                              {step.message && (
                                <div className="text-[10px] text-text-secondary/70 mt-0.5">{step.message}</div>
                              )}
                              {step.output && (
                                <pre className="mt-1 text-[10px] text-text-secondary whitespace-pre-wrap font-mono overflow-x-auto">
                                  {step.output}
                                </pre>
                              )}
                            </div>
                            <StepStatusBadge status={step.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
