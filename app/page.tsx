"use client";

import {
  Check,
  Clipboard,
  Copy,
  Edit3,
  FileText,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured, type Database } from "@/lib/supabase";

type Prompt = {
  id: string;
  userId?: string;
  title: string;
  description: string;
  template: string;
  createdAt: string;
  updatedAt: string;
};

type VariableSet = {
  id: string;
  userId?: string;
  promptId: string;
  name: string;
  values: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type PromptForm = {
  title: string;
  description: string;
  template: string;
};

type Toast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

type PromptRow = Database["public"]["Tables"]["prompts"]["Row"];
type VariableSetRow = Database["public"]["Tables"]["variable_sets"]["Row"];

const PROMPTS_KEY = "prompt-manager-prompts";
const VARIABLE_SETS_KEY = "prompt-manager-variable-sets";
const DRAFT_VALUES_KEY = "prompt-manager-draft-values";

const SAMPLE_TEMPLATE = `⭐ここだけ変更してください

【記事タイトル】
{{記事タイトル}}

【対象章】
{{対象章}}

【修正内容】
{{修正内容}}

【記事本文】
{{記事本文}}`;

const EMPTY_FORM: PromptForm = {
  title: "",
  description: "",
  template: ""
};

const nowIso = () => new Date().toISOString();

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isUuid = (value: string) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const formatDateTime = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const extractVariables = (template: string) => {
  const variables: string[] = [];
  const seen = new Set<string>();
  const matcher = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(template)) !== null) {
    const name = match[1].trim();

    if (name && !seen.has(name)) {
      seen.add(name);
      variables.push(name);
    }
  }

  return variables;
};

const buildPrompt = (template: string, values: Record<string, string>) => {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, variableName: string) => {
    const key = variableName.trim();
    return values[key] ?? "";
  });
};

const readStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = <T,>(key: string, value: T) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
};

const createSamplePrompt = (userId?: string): Prompt => {
  const createdAt = nowIso();

  return {
    id: createId(),
    userId,
    title: "記事修正プロンプト",
    description: "記事タイトル、対象章、修正内容、本文を入力して修正依頼用プロンプトを作成する。",
    template: SAMPLE_TEMPLATE,
    createdAt,
    updatedAt: createdAt
  };
};

const toPrompt = (row: PromptRow): Prompt => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  template: row.template,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toVariableSet = (row: VariableSetRow): VariableSet => ({
  id: row.id,
  userId: row.user_id,
  promptId: row.prompt_id,
  name: row.name,
  values: row.values ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const normalizeLocalPrompts = (prompts: Prompt[], userId: string) => {
  const idMap = new Map<string, string>();
  const normalizedPrompts = prompts.map((prompt) => {
    const id = isUuid(prompt.id) ? prompt.id : createId();
    idMap.set(prompt.id, id);

    return {
      ...prompt,
      id,
      userId
    };
  });

  return { idMap, normalizedPrompts };
};

function AutoTextarea({
  value,
  onChange,
  placeholder,
  minRows = 2,
  className = ""
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={minRows}
      className={`w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm transition focus:border-blue-500 ${className}`}
    />
  );
}

function ToastView({ toast }: { toast: Toast | null }) {
  if (!toast) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold shadow-lg ${
        toast.tone === "success" ? "bg-slate-950 text-white" : "bg-rose-600 text-white"
      }`}
      role="status"
    >
      {toast.tone === "success" ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
      {toast.message}
    </div>
  );
}

export default function Home() {
  const supabase = getSupabaseClient();
  const [isReady, setIsReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [variableSets, setVariableSets] = useState<VariableSet[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [mode, setMode] = useState<"use" | "edit">("use");
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptForm, setPromptForm] = useState<PromptForm>(EMPTY_FORM);
  const [variableValuesByPrompt, setVariableValuesByPrompt] = useState<Record<string, Record<string, string>>>({});
  const [setName, setSetName] = useState("");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);

  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedPromptId) ?? prompts[0] ?? null;

  const filteredPrompts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) {
      return prompts;
    }

    return prompts.filter((prompt) => {
      return `${prompt.title} ${prompt.description}`.toLowerCase().includes(keyword);
    });
  }, [prompts, searchText]);

  const variables = useMemo(() => {
    return selectedPrompt ? extractVariables(selectedPrompt.template) : [];
  }, [selectedPrompt]);

  const currentValues = selectedPrompt ? variableValuesByPrompt[selectedPrompt.id] ?? {} : {};
  const generatedPrompt = selectedPrompt ? buildPrompt(selectedPrompt.template, currentValues) : "";
  const promptVariableSets = selectedPrompt
    ? variableSets.filter((variableSet) => variableSet.promptId === selectedPrompt.id)
    : [];

  const showToast = (message: string, tone: Toast["tone"] = "success") => {
    setToast({ id: Date.now(), message, tone });
  };

  const persistLocalCache = (nextPrompts: Prompt[], nextVariableSets: VariableSet[]) => {
    writeStorage(PROMPTS_KEY, nextPrompts);
    writeStorage(VARIABLE_SETS_KEY, nextVariableSets);
  };

  const loadCloudData = async (currentUser: User) => {
    setDataLoading(true);
    setIsReady(false);

    if (!supabase) {
      setDataLoading(false);
      setIsReady(true);
      return;
    }

    try {
      const [promptsResult, variableSetsResult] = await Promise.all([
        supabase.from("prompts").select("*").order("updated_at", { ascending: false }),
        supabase.from("variable_sets").select("*").order("updated_at", { ascending: false })
      ]);

      if (promptsResult.error) {
        throw promptsResult.error;
      }

      if (variableSetsResult.error) {
        throw variableSetsResult.error;
      }

      let nextPrompts = (promptsResult.data ?? []).map(toPrompt);
      let nextVariableSets = (variableSetsResult.data ?? []).map(toVariableSet);

      if (nextPrompts.length === 0) {
        const localPrompts = readStorage<Prompt[]>(PROMPTS_KEY, []);
        const localVariableSets = readStorage<VariableSet[]>(VARIABLE_SETS_KEY, []);
        const sourcePrompts = localPrompts.length > 0 ? localPrompts : [createSamplePrompt(currentUser.id)];
        const { idMap, normalizedPrompts } = normalizeLocalPrompts(sourcePrompts, currentUser.id);
        const normalizedVariableSets = localVariableSets
          .map((variableSet): VariableSet | null => {
            const promptId = idMap.get(variableSet.promptId);

            if (!promptId) {
              return null;
            }

            return {
              ...variableSet,
              id: isUuid(variableSet.id) ? variableSet.id : createId(),
              userId: currentUser.id,
              promptId
            };
          })
          .filter((variableSet): variableSet is VariableSet => variableSet !== null);

        const insertedPrompts = await supabase
          .from("prompts")
          .insert(
            normalizedPrompts.map((prompt) => ({
              id: prompt.id,
              user_id: currentUser.id,
              title: prompt.title,
              description: prompt.description,
              template: prompt.template,
              created_at: prompt.createdAt,
              updated_at: prompt.updatedAt
            }))
          )
          .select("*");

        if (insertedPrompts.error) {
          throw insertedPrompts.error;
        }

        nextPrompts = (insertedPrompts.data ?? []).map(toPrompt);

        if (normalizedVariableSets.length > 0) {
          const insertedVariableSets = await supabase
            .from("variable_sets")
            .insert(
              normalizedVariableSets.map((variableSet) => ({
                id: variableSet.id,
                user_id: currentUser.id,
                prompt_id: variableSet.promptId,
                name: variableSet.name,
                values: variableSet.values,
                created_at: variableSet.createdAt,
                updated_at: variableSet.updatedAt
              }))
            )
            .select("*");

          if (insertedVariableSets.error) {
            throw insertedVariableSets.error;
          }

          nextVariableSets = (insertedVariableSets.data ?? []).map(toVariableSet);
        }

        showToast("LocalStorageのデータをクラウドへ移行しました");
      }

      setPrompts(nextPrompts);
      setVariableSets(nextVariableSets);
      setSelectedPromptId(nextPrompts[0]?.id ?? "");
      persistLocalCache(nextPrompts, nextVariableSets);
      setVariableValuesByPrompt(readStorage<Record<string, Record<string, string>>>(DRAFT_VALUES_KEY, {}));
    } catch (error) {
      console.error(error);
      const localPrompts = readStorage<Prompt[]>(PROMPTS_KEY, []);
      const localVariableSets = readStorage<VariableSet[]>(VARIABLE_SETS_KEY, []);
      setPrompts(localPrompts);
      setVariableSets(localVariableSets);
      setSelectedPromptId(localPrompts[0]?.id ?? "");
      showToast("クラウド同期に失敗しました。LocalStorageの控えを表示しています", "error");
    } finally {
      setDataLoading(false);
      setIsReady(true);
    }
  };

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      setPrompts([]);
      setVariableSets([]);
      setSelectedPromptId("");
      setMode("use");
      setEditingPromptId(null);
      setIsReady(false);
      return;
    }

    void loadCloudData(user);
    // loadCloudData intentionally runs only when the authenticated user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (isReady && user) {
      persistLocalCache(prompts, variableSets);
    }
  }, [isReady, prompts, user, variableSets]);

  useEffect(() => {
    if (isReady && user) {
      writeStorage(DRAFT_VALUES_KEY, variableValuesByPrompt);
    }
  }, [isReady, user, variableValuesByPrompt]);

  useEffect(() => {
    setSelectedSetId("");
    setSetName("");
  }, [selectedPromptId]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabase) {
      showToast("Supabaseの環境変数が設定されていません", "error");
      return;
    }

    if (!email.trim() || !password) {
      showToast("メールアドレスとパスワードを入力してください", "error");
      return;
    }

    setSaving(true);

    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password
        });

        if (error) {
          throw error;
        }

        showToast("登録しました。必要に応じて確認メールを開いてください");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) {
          throw error;
        }

        showToast("ログインしました");
      }
    } catch (error) {
      console.error(error);
      showToast("認証に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    showToast("ログアウトしました");
  };

  const selectPrompt = (promptId: string) => {
    setSelectedPromptId(promptId);
    setMode("use");
    setEditingPromptId(null);
  };

  const startNewPrompt = () => {
    setEditingPromptId(null);
    setPromptForm(EMPTY_FORM);
    setMode("edit");
  };

  const startEditPrompt = (prompt: Prompt) => {
    setSelectedPromptId(prompt.id);
    setEditingPromptId(prompt.id);
    setPromptForm({
      title: prompt.title,
      description: prompt.description,
      template: prompt.template
    });
    setMode("edit");
  };

  const cancelEdit = () => {
    setPromptForm(EMPTY_FORM);
    setEditingPromptId(null);
    setMode("use");
  };

  const savePrompt = async () => {
    if (!supabase || !user) {
      showToast("ログインが必要です", "error");
      return;
    }

    const title = promptForm.title.trim();

    if (!title) {
      showToast("プロンプト名を入力してください", "error");
      return;
    }

    setSaving(true);

    try {
      const timestamp = nowIso();

      if (editingPromptId) {
        const { data, error } = await supabase
          .from("prompts")
          .update({
            title,
            description: promptForm.description.trim(),
            template: promptForm.template,
            updated_at: timestamp
          })
          .eq("id", editingPromptId)
          .eq("user_id", user.id)
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const updatedPrompt = toPrompt(data);
        setPrompts((currentPrompts) =>
          currentPrompts.map((prompt) => (prompt.id === editingPromptId ? updatedPrompt : prompt))
        );
        setSelectedPromptId(editingPromptId);
        showToast("保存しました");
      } else {
        const { data, error } = await supabase
          .from("prompts")
          .insert({
            id: createId(),
            user_id: user.id,
            title,
            description: promptForm.description.trim(),
            template: promptForm.template,
            created_at: timestamp,
            updated_at: timestamp
          })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const newPrompt = toPrompt(data);
        setPrompts((currentPrompts) => [newPrompt, ...currentPrompts]);
        setSelectedPromptId(newPrompt.id);
        showToast("登録しました");
      }

      setEditingPromptId(null);
      setPromptForm(EMPTY_FORM);
      setMode("use");
    } catch (error) {
      console.error(error);
      showToast("保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  const deletePrompt = async (prompt: Prompt) => {
    if (!supabase || !user) {
      showToast("ログインが必要です", "error");
      return;
    }

    if (!window.confirm("このプロンプトを削除しますか？")) {
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.from("prompts").delete().eq("id", prompt.id).eq("user_id", user.id);

      if (error) {
        throw error;
      }

      setPrompts((currentPrompts) => {
        const nextPrompts = currentPrompts.filter((currentPrompt) => currentPrompt.id !== prompt.id);
        const nextSelected = nextPrompts[0]?.id ?? "";
        setSelectedPromptId((currentSelectedId) => (currentSelectedId === prompt.id ? nextSelected : currentSelectedId));
        return nextPrompts;
      });
      setVariableSets((currentSets) => currentSets.filter((variableSet) => variableSet.promptId !== prompt.id));
      setVariableValuesByPrompt((currentValues) => {
        const nextValues = { ...currentValues };
        delete nextValues[prompt.id];
        return nextValues;
      });
      showToast("削除しました");
    } catch (error) {
      console.error(error);
      showToast("削除に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateVariableValue = (variableName: string, value: string) => {
    if (!selectedPrompt) {
      return;
    }

    setVariableValuesByPrompt((currentValues) => ({
      ...currentValues,
      [selectedPrompt.id]: {
        ...(currentValues[selectedPrompt.id] ?? {}),
        [variableName]: value
      }
    }));
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      showToast("コピーしました");
    } catch {
      showToast("コピーに失敗しました", "error");
    }
  };

  const saveVariableSet = async () => {
    if (!supabase || !user || !selectedPrompt) {
      showToast("ログインが必要です", "error");
      return;
    }

    const name = setName.trim();

    if (!name) {
      showToast("セット名を入力してください", "error");
      return;
    }

    setSaving(true);

    try {
      const timestamp = nowIso();
      const { data, error } = await supabase
        .from("variable_sets")
        .insert({
          id: createId(),
          user_id: user.id,
          prompt_id: selectedPrompt.id,
          name,
          values: { ...currentValues },
          created_at: timestamp,
          updated_at: timestamp
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const variableSet = toVariableSet(data);
      setVariableSets((currentSets) => [variableSet, ...currentSets]);
      setSelectedSetId(variableSet.id);
      setSetName("");
      showToast("変数セットを保存しました");
    } catch (error) {
      console.error(error);
      showToast("変数セットの保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  const applyVariableSet = (event: ChangeEvent<HTMLSelectElement>) => {
    const variableSetId = event.target.value;
    setSelectedSetId(variableSetId);

    const variableSet = variableSets.find((currentSet) => currentSet.id === variableSetId);

    if (!selectedPrompt || !variableSet) {
      return;
    }

    setVariableValuesByPrompt((currentValues) => ({
      ...currentValues,
      [selectedPrompt.id]: { ...variableSet.values }
    }));
    showToast("変数セットを反映しました");
  };

  const deleteVariableSet = async () => {
    if (!supabase || !user || !selectedSetId) {
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.from("variable_sets").delete().eq("id", selectedSetId).eq("user_id", user.id);

      if (error) {
        throw error;
      }

      setVariableSets((currentSets) => currentSets.filter((variableSet) => variableSet.id !== selectedSetId));
      setSelectedSetId("");
      showToast("変数セットを削除しました");
    } catch (error) {
      console.error(error);
      showToast("変数セットの削除に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
        <section className="w-full max-w-[560px] rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Supabase設定が必要です</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            クラウド同期版では `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY`
            を設定してください。設定後にログイン画面が表示されます。
          </p>
        </section>
        <ToastView toast={toast} />
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <RefreshCw size={18} className="animate-spin" aria-hidden="true" />
          認証状態を確認しています
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
        <section className="w-full max-w-[420px] rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-semibold text-blue-700">クラウド同期版</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">プロンプト管理にログイン</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ログイン後、Mac、iPhone、iPadで同じプロンプトと変数セットを利用できます。
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleAuthSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-800">メールアドレス</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-500"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-800">パスワード</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-500"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn size={18} aria-hidden="true" />
              {saving ? "処理中" : authMode === "login" ? "ログイン" : "新規登録"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setAuthMode((currentMode) => (currentMode === "login" ? "signup" : "login"))}
            className="mt-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {authMode === "login" ? "新規登録に切り替え" : "ログインに切り替え"}
          </button>
        </section>
        <ToastView toast={toast} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] gap-4 px-4 py-4">
        <aside className="flex w-[380px] shrink-0 flex-col rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-slate-950">プロンプト管理</h1>
                <p className="mt-1 text-sm text-slate-500">クラウド同期版</p>
                <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadCloudData(user)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                  title="再同期"
                  aria-label="再同期"
                >
                  <RefreshCw size={17} className={dataLoading ? "animate-spin" : ""} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                  title="ログアウト"
                  aria-label="ログアウト"
                >
                  <LogOut size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={startNewPrompt}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              title="新規作成"
            >
              <Plus size={18} aria-hidden="true" />
              新規作成
            </button>
            <label className="mt-4 flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
              <Search size={17} aria-hidden="true" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="検索"
                className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!isReady || dataLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                <RefreshCw size={17} className="animate-spin" aria-hidden="true" />
                読み込み中
              </div>
            ) : filteredPrompts.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                プロンプトがありません
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPrompts.map((prompt) => {
                  const isSelected = selectedPrompt?.id === prompt.id;

                  return (
                    <article
                      key={prompt.id}
                      className={`rounded-md border p-3 transition ${
                        isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectPrompt(prompt.id)}
                        className="block w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="min-w-0 break-words text-base font-semibold text-slate-950">
                            {prompt.title}
                          </h2>
                          <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                            {extractVariables(prompt.template).length}変数
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
                          {prompt.description || "説明なし"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">更新: {formatDateTime(prompt.updatedAt)}</p>
                      </button>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectPrompt(prompt.id)}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          title="使用"
                        >
                          <FileText size={16} aria-hidden="true" />
                          使用
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditPrompt(prompt)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                          title="編集"
                          aria-label="編集"
                        >
                          <Edit3 size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deletePrompt(prompt)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                          title="削除"
                          aria-label="削除"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white shadow-sm">
          {mode === "edit" ? (
            <div className="flex h-full min-h-[calc(100vh-2rem)] flex-col">
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-blue-700">{editingPromptId ? "編集" : "新規作成"}</p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                    {editingPromptId ? "プロンプトを編集" : "プロンプトを登録"}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <X size={17} aria-hidden="true" />
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => void savePrompt()}
                    disabled={saving}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={17} aria-hidden="true" />
                    保存
                  </button>
                </div>
              </header>

              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-0">
                <div className="min-w-0 overflow-y-auto p-5">
                  <div className="space-y-5">
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-800">プロンプト名</span>
                      <input
                        value={promptForm.title}
                        onChange={(event) => setPromptForm((form) => ({ ...form, title: event.target.value }))}
                        className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-500"
                        placeholder="例: 記事修正プロンプト"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-800">説明</span>
                      <AutoTextarea
                        value={promptForm.description}
                        onChange={(value) => setPromptForm((form) => ({ ...form, description: value }))}
                        placeholder="用途や入力内容のメモ"
                        minRows={2}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-800">テンプレート本文</span>
                      <textarea
                        value={promptForm.template}
                        onChange={(event) => setPromptForm((form) => ({ ...form, template: event.target.value }))}
                        className="min-h-[520px] w-full resize-y rounded-md border border-slate-300 bg-white px-4 py-3 font-mono text-sm leading-6 text-slate-900 shadow-sm transition focus:border-blue-500"
                        placeholder="{{変数名}} を使って入力欄を作成できます"
                      />
                    </label>
                  </div>
                </div>

                <aside className="border-l border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-sm font-semibold text-slate-800">検出した変数</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {extractVariables(promptForm.template).length === 0 ? (
                      <p className="text-sm text-slate-500">変数はまだありません</p>
                    ) : (
                      extractVariables(promptForm.template).map((variableName) => (
                        <span
                          key={variableName}
                          className="rounded bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-900"
                        >
                          {variableName}
                        </span>
                      ))
                    )}
                  </div>
                </aside>
              </div>
            </div>
          ) : selectedPrompt ? (
            <div className="grid h-full min-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)]">
              <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Clipboard size={20} className="text-blue-600" aria-hidden="true" />
                    <h2 className="truncate text-2xl font-semibold text-slate-950">{selectedPrompt.title}</h2>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                    {selectedPrompt.description || "説明なし"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEditPrompt(selectedPrompt)}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Edit3 size={17} aria-hidden="true" />
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyPrompt()}
                    className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    <Copy size={18} aria-hidden="true" />
                    コピー
                  </button>
                </div>
              </header>

              <div className="grid min-h-0 grid-cols-[minmax(360px,0.95fr)_minmax(440px,1.05fr)]">
                <div className="min-h-0 overflow-y-auto border-r border-slate-200 p-5">
                  <div className="mb-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-end gap-3">
                      <label className="min-w-0 flex-1">
                        <span className="mb-2 block text-sm font-semibold text-slate-800">変数セット</span>
                        <select
                          value={selectedSetId}
                          onChange={applyVariableSet}
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm"
                        >
                          <option value="">選択なし</option>
                          {promptVariableSets.map((variableSet) => (
                            <option key={variableSet.id} value={variableSet.id}>
                              {variableSet.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void deleteVariableSet()}
                        disabled={!selectedSetId || saving}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title="変数セットを削除"
                        aria-label="変数セットを削除"
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={setName}
                        onChange={(event) => setSetName(event.target.value)}
                        placeholder="セット名"
                        className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void saveVariableSet()}
                        disabled={saving}
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Save size={17} aria-hidden="true" />
                        セット保存
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-950">変数入力</h3>
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {variables.length}件
                      </span>
                    </div>

                    {variables.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                        テンプレートに変数がありません
                      </div>
                    ) : (
                      variables.map((variableName) => (
                        <label key={variableName} className="block">
                          <span className="mb-2 block break-words text-sm font-semibold text-slate-800">
                            {variableName}
                          </span>
                          <AutoTextarea
                            value={currentValues[variableName] ?? ""}
                            onChange={(value) => updateVariableValue(variableName, value)}
                            placeholder={`${variableName}を入力`}
                            minRows={variableName.includes("本文") ? 7 : 2}
                          />
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex min-h-0 flex-col bg-slate-50">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">完成プロンプト</h3>
                      <p className="mt-1 text-sm text-slate-500">{generatedPrompt.length.toLocaleString()}文字</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyPrompt()}
                      className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      <Copy size={18} aria-hidden="true" />
                      コピー
                    </button>
                  </div>
                  <pre className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-sm leading-6 text-slate-900">
                    {generatedPrompt}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[calc(100vh-2rem)] items-center justify-center p-6">
              <button
                type="button"
                onClick={startNewPrompt}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Plus size={18} aria-hidden="true" />
                新規作成
              </button>
            </div>
          )}
        </section>
      </div>

      <ToastView toast={toast} />
    </main>
  );
}
