import React from "react";
import { useTranslation } from "react-i18next";
import Button from "../shared/Button";
import Input from "../shared/Input";

type OAuthPromptContentProps = {
  message: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  busy?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
};

export default function OAuthPromptContent({
  message,
  placeholder,
  value,
  onChange,
  onSubmit,
  onCancel,
  busy = false,
  submitLabel,
  cancelLabel,
}: OAuthPromptContentProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-text-secondary">{message}</p>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t("settings.oauthPlaceholder")}
      />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
        ) : null}
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={busy || !value.trim()}>
          {submitLabel ?? t("common.confirm")}
        </Button>
      </div>
    </div>
  );
}
