"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { deleteBomList, fetchBom, getTemplateUrl, uploadBom } from "@/lib/api";
import { StatusPill } from "@/components/ui/status-pill";
import type { BomItem } from "@/types";

export default function BomDataPage() {
  const [rowsRaw, setRowsRaw] = useState<BomItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [uploadedFile, setUploadedFile] = useState("未导入");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await fetchBom();
      setRowsRaw(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    try {
      setError(null);
      setIsUploading(true);
      const result = await uploadBom(file);
      setUploadedFile(`${file.name}（${result.upserted} 条已导入）`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setIsUploading(false);
    }
  };

  const rows = useMemo(
    () =>
      rowsRaw.filter(
        (item) =>
          item.parent_pn.toLowerCase().includes(keyword.toLowerCase()) ||
          item.child_pn.toLowerCase().includes(keyword.toLowerCase()) ||
          item.supplier_name.toLowerCase().includes(keyword.toLowerCase())
      ),
    [keyword, rowsRaw]
  );

  const usCount = useMemo(() => rowsRaw.filter((item) => item.is_us_material).length, [rowsRaw]);

  const onDeleteList = async () => {
    if (!window.confirm("确认删除当前全部 BOM 列表吗？删除后可重新上传。")) return;
    try {
      setError(null);
      setIsDeleting(true);
      const result = await deleteBomList();
      setUploadedFile(`列表已清空（删除 ${result.deleted} 条）`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-2xl font-semibold text-white">BOM 主数据管理</h2>
        <p className="mt-1 text-sm text-industrial-300">
          支持 Excel / CSV 导入、模板下载、关键字检索与涉美物料快速识别。
        </p>
      </section>

      {error && <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="w-full max-w-sm rounded-md border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
            placeholder="搜索父项 / 子项料号 / 供应商"
          />
          <label className={`cursor-pointer rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100 transition hover:border-indigo-400 ${isUploading ? "pointer-events-none opacity-50" : ""}`}>
            {isUploading ? "导入中..." : "导入 BOM Excel"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void onUpload(file);
                event.target.value = "";
              }}
            />
          </label>
          <a
            href={getTemplateUrl("bom")}
            download
            className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300 transition hover:border-emerald-500 hover:bg-emerald-900/50"
          >
            下载 BOM 模板
          </a>
          <button
            type="button"
            onClick={() => { void onDeleteList(); }}
            disabled={isDeleting || isUploading}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              isDeleting || isUploading
                ? "cursor-not-allowed border-industrial-600 bg-industrial-900 text-industrial-500"
                : "border-rose-700 bg-rose-900/30 text-rose-300 hover:border-rose-500 hover:bg-rose-900/50"
            }`}
          >
            {isDeleting ? "删除中..." : "删除 BOM 列表"}
          </button>
          <span className="text-xs text-industrial-300">最近导入：{uploadedFile}</span>
        </div>
        <p className="mt-2 text-xs text-industrial-400">
          模板含 10 列：上级料号、下级料号、供应商、物料描述、物料类型、单位用量、用量单位、BOM 层级、美系标识、可替代料（AML），支持 .xlsx 格式。
        </p>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-industrial-100">BOM 清单</h3>
          <div className="flex flex-wrap gap-3 text-xs text-industrial-300">
            <span>共 {rowsRaw.length} 条</span>
            {keyword && <span className="text-amber-300">搜索匹配 {rows.length} 条</span>}
            <span className={usCount > 0 ? "text-rose-300" : "text-industrial-400"}>
              涉美物料 {usCount} 条
            </span>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="text-industrial-300">
              <tr>
                <th className="pb-2">上级料号</th>
                <th className="pb-2">下级料号</th>
                <th className="pb-2">供应商</th>
                <th className="pb-2">物料描述</th>
                <th className="pb-2">物料类型</th>
                <th className="pb-2">单位用量</th>
                <th className="pb-2">用量单位</th>
                <th className="pb-2">BOM 层级</th>
                <th className="pb-2">美系标识</th>
                <th className="pb-2">可替代料（AML）</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="py-3 text-industrial-400" colSpan={10}>加载中...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td className="py-3 text-industrial-400" colSpan={10}>{keyword ? "无匹配结果" : "暂无 BOM 数据，请导入 Excel 或下载模板填写后上传。"}</td></tr>
              )}
              {rows.map((item) => (
                <tr key={`${item.parent_pn}-${item.child_pn}`} className="border-t border-industrial-700">
                  <td className="py-2 text-industrial-100">{item.parent_pn}</td>
                  <td className="py-2 text-industrial-100">{item.child_pn}</td>
                  <td className="py-2 text-industrial-100">{item.supplier_name || "--"}</td>
                  <td className="py-2 text-industrial-100">{item.material_desc || "--"}</td>
                  <td className="py-2 text-industrial-100">{item.material_type || "--"}</td>
                  <td className="py-2 text-industrial-100">{item.qty_per}</td>
                  <td className="py-2 text-industrial-100">{item.usage_uom}</td>
                  <td className="py-2 text-industrial-100">{item.level}</td>
                  <td className="py-2">
                    <StatusPill label={item.is_us_material ? "是" : "否"} tone={item.is_us_material ? "risk" : "good"} />
                  </td>
                  <td className="py-2 text-industrial-300">{item.aml.length ? item.aml.join(", ") : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
