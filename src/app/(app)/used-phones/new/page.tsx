"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Camera, ImagePlus, Save, ShieldCheck, Smartphone, UserRound, X } from "lucide-react";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { CustomerPicker, type PartyLite } from "@/components/customer-picker";
import { CheckDigit, type DeviceRow } from "@/components/devices";
import { CameraButton, CameraScanner } from "@/components/barcode-scanner";
import { useToast } from "@/components/toast";
import { api, formatDate } from "@/lib/client";
import { cnicOrNull } from "@/lib/cnic";
import { compressImage } from "@/lib/image";
import { cleanImei, PTA_LABELS } from "@/lib/imei";
import { formatPKR } from "@/lib/money";
import { PTA_STATUS } from "@/lib/constants";
import { useT } from "@/lib/i18n";

type Model = { _id: string; name: string; salePrice: number; trackSerial?: boolean };

const CHECKS = [
  ["screen", "Screen & touch OK"],
  ["body", "Body / frame OK"],
  ["camera", "Cameras OK"],
  ["audio", "Speaker & mic OK"],
  ["charging", "Charging port OK"],
  ["biometric", "Fingerprint / face unlock OK"],
  ["network", "SIM signal & Wi-Fi OK"],
  ["buttons", "Buttons OK"],
] as const;
const ACCESSORIES = ["Box", "Charger", "Cable", "Earphones", "Purchase receipt"];

export default function BuyUsedPhonePage() {
  const toast = useToast();
  const t = useT();
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [seller, setSeller] = useState({ name: "", cnic: "", phone: "", address: "" });
  const [party, setParty] = useState<PartyLite | null>(null);
  const [pickParty, setPickParty] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
  const [newModel, setNewModel] = useState(false);
  const [productId, setProductId] = useState("");
  const [modelName, setModelName] = useState("");
  const [imei, setImei] = useState("");
  const [imei2, setImei2] = useState("");
  const [camera, setCamera] = useState(false);
  const [history, setHistory] = useState<{ checkOk: boolean; records: DeviceRow[] } | null>(null);
  const [phone, setPhone] = useState({ color: "", storage: "", pta: "approved" as (typeof PTA_STATUS)[number], condition: "used" as "used" | "refurbished" });
  const [checks, setChecks] = useState<Record<string, boolean>>(Object.fromEntries(CHECKS.map(([k]) => [k, true])));
  const [battery, setBattery] = useState("");
  const [accessories, setAccessories] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [asking, setAsking] = useState("");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [declared, setDeclared] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Model[]>("/api/products?limit=5000")
      .then((list) => {
        const phones = list.filter((p) => p.trackSerial);
        setModels(phones);
        if (!phones.length) setNewModel(true);
      })
      .catch(() => {});
  }, []);

  // Look the IMEI up as it is entered: was this phone in our shop before?
  useEffect(() => {
    const c = cleanImei(imei);
    if (c.length < 8) return setHistory(null);
    const t = setTimeout(() => {
      api<{ checkOk: boolean; records: DeviceRow[] }>(`/api/devices/lookup?imei=${c}`)
        .then(setHistory)
        .catch(() => setHistory(null));
    }, 300);
    return () => clearTimeout(t);
  }, [imei]);

  const cnicOk = !!cnicOrNull(seller.cnic);
  const inStock = history?.records.some((r) => r.status === "in_stock");
  const profit = Number(asking) - Number(price);

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    for (const f of files.slice(0, 3 - photos.length)) {
      try {
        const data = await compressImage(f);
        setPhotos((p) => [...p, data].slice(0, 3));
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!cnicOk) return toast.error(t("Enter the seller's 13-digit CNIC."));
    if (inStock) return toast.error(t("This IMEI is already in stock."));
    if (!declared) return toast.error(t("Read the declaration to the seller and tick it."));
    setSaving(true);
    try {
      const r = await api<{ _id: string; buyNo: string }>("/api/used-phones", {
        body: {
          seller: { ...seller, partyId: party?._id },
          photos,
          ...(newModel ? { newModel: { name: modelName, salePrice: Number(asking) || 0 } } : { productId }),
          imei,
          imei2: imei2 || undefined,
          color: phone.color || undefined,
          storage: phone.storage || undefined,
          pta: phone.pta,
          condition: phone.condition,
          checks,
          batteryHealth: battery === "" ? undefined : Number(battery),
          accessories,
          notes: notes || undefined,
          price: Number(price),
          askingPrice: Number(asking) || undefined,
          method,
          paymentRef: ref || undefined,
          declaration: true,
        },
      });
      toast.success(t("{no} saved — the phone is in stock", { no: r.buyNo }));
      window.open(`/receipt/used/${r._id}?print=1`, "_blank");
      router.push("/used-phones");
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <Link href="/used-phones" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {t("Back to used phones")}
      </Link>
      <PageHeader title="Buy a Used Phone" urdu="پرانا فون خریدیں" subtitle="Check the CNIC and the phone carefully. The seller signs the printed agreement." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
              <UserRound className="h-5 w-5 text-brand-600" /> {t("Seller")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name (as on CNIC) *">
                <Input required minLength={3} value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} aria-label="Seller name" />
              </Field>
              <Field label="CNIC *" error={seller.cnic && !cnicOk ? t("13 digits, e.g. 35202-1234567-1") : undefined}>
                <Input
                  required
                  inputMode="numeric"
                  value={seller.cnic}
                  onChange={(e) => setSeller({ ...seller, cnic: e.target.value })}
                  onBlur={() => cnicOk && setSeller((s) => ({ ...s, cnic: cnicOrNull(s.cnic)! }))}
                  placeholder="35202-1234567-1"
                  aria-label="Seller CNIC"
                />
              </Field>
              <Field label="Mobile number *">
                <Input required inputMode="tel" value={seller.phone} onChange={(e) => setSeller({ ...seller, phone: e.target.value })} placeholder="03xx xxxxxxx" aria-label="Seller mobile" />
              </Field>
              <Field label="Address (optional)">
                <Input value={seller.address} onChange={(e) => setSeller({ ...seller, address: e.target.value })} aria-label="Seller address" />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {party ? (
                <span className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-1.5 text-brand-800">
                  {t("Linked to khata:")} <b>{party.name}</b>
                  <button type="button" onClick={() => setParty(null)} aria-label="Unlink customer">
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setPickParty(true)}>
                  Seller is a customer (trade-in / khata)
                </Button>
              )}
            </div>
            <div className="mt-4">
              <div className="mb-1.5 text-sm font-medium text-slate-700">{t("Photos of the seller / CNIC / phone (up to 3)")}</div>
              <div className="flex flex-wrap gap-3">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={`Photo ${i + 1}`} className="h-24 w-24 rounded-xl border border-slate-200 object-cover" />
                    <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow" aria-label="Remove photo">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {photos.length < 3 && (
                  <button type="button" onClick={() => photoInput.current?.click()} className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400">
                    <ImagePlus className="h-6 w-6" /> {t("Add photo")}
                  </button>
                )}
              </div>
              <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={addPhoto} aria-label="Add photos" />
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Camera className="h-3.5 w-3.5" /> {t("On a phone or tablet this opens the camera.")}
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
              <Smartphone className="h-5 w-5 text-brand-600" /> {t("Phone")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {newModel ? (
                <Field label="Model *" hint={models.length ? undefined : "Saved as a new phone model (tracked by IMEI)"}>
                  <Input required value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder={t("e.g. {n}", { n: "Samsung Galaxy S21 128GB" })} aria-label="New model name" />
                </Field>
              ) : (
                <Field label="Model *">
                  <Select required value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Phone model">
                    <option value="">{t("Choose the model")}</option>
                    {models.map((m) => (
                      <option key={m._id} value={m._id}>{m.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="flex items-end">
                {models.length > 0 && (
                  <button type="button" className="mb-3 text-sm font-semibold text-brand-700" onClick={() => setNewModel(!newModel)}>
                    {newModel ? t("Choose an existing model") : t("+ Model not in the list")}
                  </button>
                )}
              </div>
              <Field label="IMEI 1 * (dial *#06#)">
                <div className="flex gap-2">
                  <Input required value={imei} onChange={(e) => setImei(e.target.value)} className="min-w-0 flex-1 font-mono" aria-label="IMEI" onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
                  <CameraButton onClick={() => setCamera(true)} />
                </div>
              </Field>
              <Field label="IMEI 2 (dual SIM)">
                <Input value={imei2} onChange={(e) => setImei2(e.target.value)} className="font-mono" aria-label="IMEI 2" onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
              </Field>
              {history && (
                <div className="space-y-2 sm:col-span-2">
                  <CheckDigit ok={history.checkOk} />
                  {history.records.length === 0 ? (
                    <p className="text-xs text-slate-500">{t("This IMEI has never been in your shop.")}</p>
                  ) : (
                    history.records.map((r) => (
                      <div key={r._id} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${r.status === "in_stock" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {r.status === "in_stock"
                            ? t("This IMEI is already in your stock ({name}). It cannot be bought again.", { name: r.productName })
                            : r.sale
                              ? t("Your shop sold this phone ({name}) on {date}{to} — bill {no}.", { name: r.productName, date: formatDate(r.sale.at), to: r.sale.customerName ? ` ${t("to {name}", { name: r.sale.customerName })}` : "", no: r.sale.invoiceNo })
                              : t("This IMEI was in your shop before ({name}, {status}).", { name: r.productName, status: r.status })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
              <Field label="Colour">
                <Input value={phone.color} onChange={(e) => setPhone({ ...phone, color: e.target.value })} aria-label="Colour" />
              </Field>
              <Field label="Storage">
                <Input value={phone.storage} onChange={(e) => setPhone({ ...phone, storage: e.target.value })} placeholder="8/128GB" aria-label="Storage" />
              </Field>
              <Field label="PTA">
                <Select value={phone.pta} onChange={(e) => setPhone({ ...phone, pta: e.target.value as typeof phone.pta })} aria-label="PTA status">
                  {PTA_STATUS.map((p) => (
                    <option key={p} value={p}>{t(PTA_LABELS[p])}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Battery health % (optional)">
                <Input type="number" min="0" max="100" value={battery} onChange={(e) => setBattery(e.target.value)} aria-label="Battery health" />
              </Field>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-slate-700">{t("Checked")}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHECKS.map(([k, label]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} className="h-4 w-4 accent-brand-600" />
                    {t(label)}
                  </label>
                ))}
              </div>
              <div className="mb-2 mt-4 text-sm font-medium text-slate-700">{t("Came with")}</div>
              <div className="flex flex-wrap gap-2">
                {ACCESSORIES.map((a) => (
                  <label key={a} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={accessories.includes(a)} onChange={(e) => setAccessories(e.target.checked ? [...accessories, a] : accessories.filter((x) => x !== a))} className="h-4 w-4 accent-brand-600" />
                    {t(a)}
                  </label>
                ))}
              </div>
              <Field label="Notes (scratches, repairs, anything else)" className="mt-4">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" aria-label="Notes" />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 lg:sticky lg:top-6">
            <h2 className="mb-4 font-bold text-slate-900">{t("Price")}</h2>
            <div className="space-y-4">
              <Field label="Paid to the seller (Rs) *">
                <Input required type="number" min="1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="text-lg font-bold" aria-label="Price paid" />
              </Field>
              <Field label="Sell it for (Rs)" hint={price && asking ? t("Profit when sold: {amount}", { amount: formatPKR(profit) }) : "Its price on the bill; empty = model price"}>
                <Input type="number" min="0" inputMode="decimal" value={asking} onChange={(e) => setAsking(e.target.value)} aria-label="Sale price" />
              </Field>
              <Field label="Paid by">
                <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Paid by">
                  <option value="cash">{t("Cash from drawer")}</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="bank">{t("Bank transfer")}</option>
                  {party && <option value="khata">{t("Put in {name}'s khata (trade-in)", { name: party.name })}</option>}
                </Select>
              </Field>
              {method !== "cash" && method !== "khata" && (
                <Field label="Transaction ID (optional)">
                  <Input value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Transaction ID" />
                </Field>
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" aria-label="Seller declaration" />
                <span>
                  <b>{t("Seller's declaration:")}</b> this phone is my own property, it is not stolen, snatched or under any dispute or installment, and I sell it with my own will.
                  <span className="urdu mt-1 block text-right">یہ فون میری ملکیت ہے، چوری یا چھینا ہوا نہیں ہے، اور میں اپنی مرضی سے فروخت کر رہا ہوں۔</span>
                </span>
              </label>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-brand-600" /> {t("The agreement prints for the seller to sign with a thumb impression.")}
              </div>
              <Button type="submit" size="lg" className="w-full" loading={saving} icon={<Save className="h-5 w-5" />}>
                Save & print agreement
              </Button>
              {inStock && <Badge color="red">IMEI already in stock</Badge>}
            </div>
          </Card>
        </div>
      </div>
      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={(c) => setImei(cleanImei(c))} title={t("Scan the IMEI barcode (box or *#06#)")} />
      <CustomerPicker
        open={pickParty}
        onClose={() => setPickParty(false)}
        onPick={(p) => {
          setParty(p);
          setSeller((s) => ({ ...s, name: s.name || p.name, phone: s.phone || p.phone || "" }));
          setPickParty(false);
        }}
      />
    </form>
  );
}
