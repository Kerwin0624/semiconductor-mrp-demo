"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { deleteMaterialsList, fetchMaterials, getTemplateUrl, uploadMaterials } from "@/lib/api";
import type { MaterialItem } from "@/types";

export default function MaterialsDataPage() {
  const [rowsRaw, setRowsRaw] = useState<MaterialItem[]>([]);
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
      setRowsRaw(await fetchMaterials());
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
      const result = await uploadMaterials(file);
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
          item.material_pn.toLowerCase().includes(keyword.toLowerCase()) ||
          item.supplier_name.toLowerCase().includes(keyword.toLowerCase())
      ),
    [keyword, rowsRaw]
  );

  const updateInventory = (materialPn: string, value: number) => {
    setRowsRaw((prev) =>
      prev.map((item) => (item.material_pn === materialPn ? { ...item, on_hand_inventory: value } : item))
    );
  };

  const lowStockCount = useMemo(
    () => rowsRaw.filter((item) => item.on_hand_inventory < item.safety_stock).length,
    [rowsRaw]
  );

  const onDeleteList = async () => {
    if (!window.confirm("确认删除当前全部物料列表吗？删除后可重新上传。")) return;
    try {
      setError(null);
      setIsDeleting(true);
      const result = await deleteMaterialsList();
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
        <h2 className="text-2xl font-semibold text-white">物料主数据管理</h2>
        <p className="mt-1 text-sm text-industrial-300">
          支持 Excel / CSV 导入、模板下载、关键字检索，并可直接在表格中模拟调整库存。
        </p>
      </section>

      {error && <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="w-full max-w-sm rounded-md border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
            placeholder="搜索物料料号 / 供应商"
          />
          <label className={`cursor-pointer rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100 transition hover:border-indigo-400 ${isUploading ? "pointer-events-none opacity-50" : ""}`}>
            {isUploading ? "导入中..." : "导入物料 Excel"}
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
            href={getTemplateUrl("materials")}
            download
            className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300 transition hover:border-emerald-500 hover:bg-emerald-900/50"
          >
            下载物料模板
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
            {isDeleting ? "删除中..." : "删除物料列表"}
          </button>
          <span className="text-xs text-industrial-300">最近导入：{uploadedFile}</span>
        </div>
        <p className="mt-2 text-xs text-industrial-400">
          模板含 13 列：物料料号、供应商、物料描述、物料类型、采购提前期、实际到货日期、保质期截止、现有库存、在途库存、安全库存、批量、良率、库存单位，支持 .xlsx 格式。
        </p>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-industrial-100">物料清单</h3>
          <div className="flex flex-wrap gap-3 text-xs text-industrial-300">
            <span>共 {rowsRaw.length} 条</span>
            {keyword && <span className="text-amber-300">搜索匹配 {rows.length} 条</span>}
            <span className={lowStockCount > 0 ? "text-rose-300" : "text-industrial-400"}>
              库存低于安全线 {lowStockCount} 条
            </span>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1400px] text-left text-sm">
            <thead className="text-industrial-300">
              <tr>
                <th className="pb-2">物料料号</th>
                <th className="pb-2">供应商</th>
                <th className="pb-2">物料描述</th>
                <th className="pb-2">物料类型</th>
                <th className="pb-2">采购提前期</th>
                <th className="pb-2">实际到货日期</th>
                <th className="pb-2">保质期截止</th>
                <th className="pb-2">现有库存</th>
                <th className="pb-2">在途库存</th>
                <th className="pb-2">安全库存</th>
                <th className="pb-2">批量</th>
                <th className="pb-2">良率</th>
                <th className="pb-2">库存单位</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="py-3 text-industrial-400" colSpan={13}>加载中...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td className="py-3 text-industrial-400" colSpan={13}>{keyword ? "无匹配结果" : "暂无物料数据，请导入 Excel 或下载模板填写后上传。"}</td></tr>
              )}
              {rows.map((item) => {
                const isLow = item.on_hand_inventory < item.safety_stock;
                return (
                  <tr key={item.material_pn} className={`border-t border-industrial-700 ${isLow ? "bg-rose-900/10" : ""}`}>
                    <td className="py-2 text-industrial-100">{item.material_pn}</td>
                    <td className="py-2 text-industrial-100">{item.supplier_name || "--"}</td>
                    <td className="py-2 text-industrial-100">{item.description || "--"}</td>
                    <td className="py-2 text-industrial-100">{item.material_type || "--"}</td>
                    <td className="py-2 text-industrial-100">{item.lead_time_days} 天</td>
                    <td className="py-2 text-industrial-100">{item.actual_delivery_date ?? "--"}</td>
                    <td className="py-2 text-industrial-100">{item.shelf_life_expiry ?? "--"}</td>
                    <td className="py-2 text-industrial-100">
                      <input
                        type="number"
                        value={item.on_hand_inventory}
                        onChange={(event) => updateInventory(item.material_pn, Number(event.target.value))}
                        className={`w-24 rounded border px-2 py-1 text-xs text-industrial-100 ${isLow ? "border-rose-600 bg-rose-900/30" : "border-industrial-600 bg-industrial-900"}`}
                      />
                    </td>
                    <td className="py-2 text-industrial-100">{item.in_transit_inventory}</td>
                    <td className="py-2 text-industrial-100">{item.safety_stock}</td>
                    <td className="py-2 text-industrial-100">{item.lot_size}</td>
                    <td className="py-2 text-industrial-100">{Math.round(item.yield_rate * 100)}%</td>
                    <td className="py-2 text-industrial-100">{item.inventory_uom || "EA"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
