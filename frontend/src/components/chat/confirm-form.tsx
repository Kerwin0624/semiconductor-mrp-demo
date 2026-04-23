"use client";

import { useEffect, useState } from "react";

import type { ChatIntent, ChatInterviewQuestion } from "@/types";

interface ConfirmFormProps {
  intent: ChatIntent | null;
  onSubmit: (params: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}

export function ConfirmForm({ intent, onSubmit, disabled }: ConfirmFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finalConfirmChecked, setFinalConfirmChecked] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const initialAnswers: Record<string, string> = {};
    const recognized = intent?.recognized_params ?? {};
    (intent?.interview_questions ?? []).slice(0, 5).forEach((q) => {
      const rv = recognized[q.param_key];
      if (rv === undefined || rv === null) return;
      if (q.input_type === "boolean") {
        initialAnswers[q.id] = Boolean(rv) ? "true" : "false";
      } else {
        initialAnswers[q.id] = String(rv);
      }
    });
    setAnswers(initialAnswers);
    setFinalConfirmChecked(false);
    setCurrentIndex(0);
  }, [intent?.intent_type, intent?.recognized_params, intent?.interview_questions]);

  if (!intent || intent.intent_type === "unknown") {
    return null;
  }
  const interviewQuestions = (intent.interview_questions ?? []).slice(0, 5);
  const totalQuestions = interviewQuestions.length;
  const currentQuestion = interviewQuestions[currentIndex] ?? null;
  const isLastQuestion = totalQuestions === 0 || currentIndex >= totalQuestions - 1;
  const showFinalConfirm = totalQuestions === 0 || currentIndex >= totalQuestions;

  const submit = async () => {
    try {
      setError(null);
      const payload: Record<string, unknown> = {};
      for (const q of interviewQuestions) {
        const value = (answers[q.id] ?? "").trim();
        if (q.required && !value) {
          setError(`请先回答：${q.question}`);
          return;
        }
        if (!value) continue;
        if (q.input_type === "boolean") {
          payload[q.param_key] = value === "true";
        } else {
          payload[q.param_key] = value;
        }
      }
      if (!finalConfirmChecked) {
        setError("执行前请先勾选最终确认。");
        return;
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    }
  };

  const renderQuestionInput = (q: ChatInterviewQuestion) => {
    const value = answers[q.id] ?? "";
    if (q.input_type === "date") {
      return (
        <input
          type="date"
          value={value}
          onChange={(event) => setAnswers((prev) => ({ ...prev, [q.id]: event.target.value }))}
          className="mt-1 w-full rounded border border-industrial-600 bg-industrial-800 px-2 py-1 text-sm text-industrial-100"
        />
      );
    }
    if (q.input_type === "boolean" || q.input_type === "select") {
      const options = q.options.length > 0 ? q.options : ["true", "false"];
      return (
        <select
          value={value}
          onChange={(event) => setAnswers((prev) => ({ ...prev, [q.id]: event.target.value }))}
          className="mt-1 w-full rounded border border-industrial-600 bg-industrial-800 px-2 py-1 text-sm text-industrial-100"
        >
          <option value="">请选择</option>
          {options.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(event) => setAnswers((prev) => ({ ...prev, [q.id]: event.target.value }))}
        className="mt-1 w-full rounded border border-industrial-600 bg-industrial-800 px-2 py-1 text-sm text-industrial-100"
        placeholder={q.placeholder || "请输入"}
      />
    );
  };

  const goNext = () => {
    if (!currentQuestion) {
      setCurrentIndex(totalQuestions);
      return;
    }
    const answer = (answers[currentQuestion.id] ?? "").trim();
    if (currentQuestion.required && !answer) {
      setError(`请先回答：${currentQuestion.question}`);
      return;
    }
    setError(null);
    setCurrentIndex((idx) => Math.min(idx + 1, totalQuestions));
  };

  const goPrev = () => {
    setError(null);
    setCurrentIndex((idx) => Math.max(idx - 1, 0));
  };

  return (
    <section className="rounded-lg border border-industrial-600 bg-industrial-900/80 p-3">
      <p className="text-xs text-industrial-300">采访式确认（最多 5 问）</p>
      <p className="mt-1 text-sm text-industrial-100">{intent.confirmation_prompt}</p>
      {currentQuestion ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-industrial-400">
            问题 {currentIndex + 1} / {totalQuestions}
          </p>
          <label className="text-xs text-industrial-300">
            {currentQuestion.question}
            {currentQuestion.required ? "（必答）" : "（可选）"}
            {renderQuestionInput(currentQuestion)}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={disabled || currentIndex === 0}
              className="rounded border border-industrial-600 bg-industrial-800 px-3 py-1.5 text-xs text-industrial-100 disabled:opacity-50"
            >
              上一步
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={disabled}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-60"
            >
              {isLastQuestion ? "完成采访" : "下一题"}
            </button>
          </div>
        </div>
      ) : null}

      {showFinalConfirm ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-industrial-200">
          <input
            type="checkbox"
            checked={finalConfirmChecked}
            onChange={(event) => setFinalConfirmChecked(event.target.checked)}
            className="h-4 w-4 rounded border-industrial-600 bg-industrial-800 text-emerald-500"
          />
          {intent.final_confirmation_prompt || "以上理解是否正确？确认后执行。"}
        </label>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      {showFinalConfirm ? (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled}
          className="mt-3 rounded bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-60"
        >
          最终确认并执行重排程
        </button>
      ) : null}
    </section>
  );
}
