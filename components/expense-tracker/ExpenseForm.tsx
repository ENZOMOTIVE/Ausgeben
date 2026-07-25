"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  formatAmountForInput,
  isValidDateString,
  parseEuroAmount,
} from "@/lib/expenses";
import { formatLongDate } from "@/lib/formatters";
import type { Expense, ExpenseDraft } from "@/types/expense";

type ExpenseFormProps = {
  expense: Expense | null;
  defaultDate: string;
  onSubmit: (draft: ExpenseDraft) => boolean;
  onDelete: (() => boolean) | null;
  onClose: () => void;
};

type FormErrors = {
  amount?: string;
  description?: string;
  date?: string;
};

export function ExpenseForm({
  expense,
  defaultDate,
  onSubmit,
  onDelete,
  onClose,
}: ExpenseFormProps) {
  const titleId = useId();
  const amountErrorId = useId();
  const descriptionErrorId = useId();
  const dateErrorId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(
    expense ? formatAmountForInput(expense.amountCents) : "",
  );
  const [description, setDescription] = useState(
    expense?.description ?? "",
  );
  const [date, setDate] = useState(expense?.date ?? defaultDate);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => amountRef.current?.focus(), 180);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const validate = (): ExpenseDraft | null => {
    const nextErrors: FormErrors = {};
    const amountCents = parseEuroAmount(amount);
    const normalizedDescription = description.trim();

    if (amountCents === null) {
      nextErrors.amount = "Enter an amount greater than €0,00.";
    }

    if (!normalizedDescription) {
      nextErrors.description = "Add what you spent the money on.";
    }

    if (!isValidDateString(date) || date > defaultDate) {
      nextErrors.date = "Choose today or an earlier date.";
    }

    setErrors(nextErrors);

    if (
      amountCents === null ||
      !normalizedDescription ||
      !isValidDateString(date) ||
      date > defaultDate
    ) {
      return null;
    }

    return {
      amountCents,
      description: normalizedDescription,
      date,
    };
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = validate();

    if (draft) onSubmit(draft);
  };

  const handleBackdrop = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) onClose();
  };

  const handleDelete = () => {
    if (!onDelete) return;

    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }

    onDelete();
  };

  return (
    <div className="sheet-backdrop" onPointerDown={handleBackdrop}>
      <section
        className="expense-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="sheet-handle" aria-hidden="true" />

        <div className="sheet-heading">
          <div>
            <p className="eyebrow">{expense ? "Make a correction" : "Quick entry"}</p>
            <h2 id={titleId}>{expense ? "Edit expense" : "Add an expense"}</h2>
          </div>
          <button className="icon-button close-button" type="button" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">Close expense form</span>
          </button>
        </div>

        <form className="expense-form" onSubmit={handleSubmit} noValidate>
          <div className="field-group amount-group">
            <label htmlFor="expense-amount">Amount</label>
            <div className="amount-input-wrap">
              <span aria-hidden="true">€</span>
              <input
                ref={amountRef}
                id="expense-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  if (errors.amount) setErrors((current) => ({ ...current, amount: undefined }));
                }}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? amountErrorId : undefined}
              />
            </div>
            {errors.amount ? (
              <p className="field-error" id={amountErrorId} role="alert">
                {errors.amount}
              </p>
            ) : (
              <p className="field-hint">Comma or dot decimals both work.</p>
            )}
          </div>

          <div className="field-group">
            <label htmlFor="expense-description">What did you spend on?</label>
            <input
              id="expense-description"
              name="description"
              type="text"
              autoComplete="off"
              maxLength={80}
              placeholder="e.g. Groceries at REWE"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                if (errors.description) {
                  setErrors((current) => ({ ...current, description: undefined }));
                }
              }}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? descriptionErrorId : undefined}
            />
            {errors.description ? (
              <p className="field-error" id={descriptionErrorId} role="alert">
                {errors.description}
              </p>
            ) : null}
          </div>

          <div className="field-group">
            <div className="label-line">
              <label htmlFor="expense-date">Date</label>
              <span>{isValidDateString(date) ? formatLongDate(date) : ""}</span>
            </div>
            <input
              id="expense-date"
              name="date"
              type="date"
              max={defaultDate}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                if (errors.date) setErrors((current) => ({ ...current, date: undefined }));
              }}
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? dateErrorId : undefined}
            />
            {errors.date ? (
              <p className="field-error" id={dateErrorId} role="alert">
                {errors.date}
              </p>
            ) : null}
          </div>

          <div className="sheet-actions">
            {expense && onDelete ? (
              <button
                className={isConfirmingDelete ? "delete-button confirming" : "delete-button"}
                type="button"
                onClick={handleDelete}
                onBlur={() => setIsConfirmingDelete(false)}
              >
                {isConfirmingDelete ? "Tap again to delete" : "Delete"}
              </button>
            ) : (
              <span />
            )}
            <button className="primary-button save-button" type="submit">
              {expense ? "Save changes" : "Save expense"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
