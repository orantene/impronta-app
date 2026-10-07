import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MoneyBreakdown } from "../components/MoneyBreakdown";
import { Layout, type EmailBrand } from "../components/Layout";
import PaymentReceipt from "./PaymentReceipt";
import PaymentRefunded from "./PaymentRefunded";
import { clientManageUrl } from "@/lib/notifications/client-visit-url";

/** 1,000.00 service + 1.5% Tulala fee 15.00 = 1,015.00 MXN. */
const LINES = [
  { code: "service_subtotal", cents: 100_000 },
  { code: "platform_fee", cents: 1_500 },
  { code: "total_charged", cents: 101_500 },
] as const;

const BRAND: EmailBrand = {
  wordmark: "ZOE STUDIO",
  accountName: "Zoe Studio",
  footerDomain: "zoe.example",
  homeHref: "https://zoe.example",
  locale: "en",
};

const receipt = (extra: Record<string, unknown> = {}, brand: EmailBrand = BRAND) =>
  renderToStaticMarkup(
    <PaymentReceipt
      clientName="Ana"
      contactName="Boda"
      amountPaid="MXN 1,015.00"
      paymentDate="1 Oct 2026"
      receiptUrl="https://zoe.example/client/bookings/b1?tab=payment"
      brand={brand}
      {...extra}
    />,
  );

const ITEMISED = {
  sellerName: "Zoe Studio",
  feeLines: LINES,
  amountCents: 101_500,
  currency: "mxn",
};

describe("MoneyBreakdown", () => {
  test("renders MXN lines in English", () => {
    const html = renderToStaticMarkup(
      <MoneyBreakdown feeLines={LINES} totalCents={101_500} currency="MXN" locale="en" />,
    );
    assert.match(html, /Service/);
    assert.match(html, /Tulala service fee \(1\.5%\)/);
    assert.match(html, /MX\$15\.00 MXN/);
    assert.match(html, /Total/);
    assert.match(html, /MX\$1,015\.00 MXN/);
  });

  test("renders Spanish labels", () => {
    const html = renderToStaticMarkup(
      <MoneyBreakdown feeLines={LINES} totalCents={101_500} currency="MXN" locale="es" />,
    );
    assert.match(html, /Servicio/);
    assert.match(html, /Cargo por servicio Tulala \(1\.5%\)/);
    assert.match(html, /MX\$1,015\.00 MXN/);
  });

  test("lines that do not add up render nothing", () => {
    const html = renderToStaticMarkup(
      <MoneyBreakdown feeLines={LINES} totalCents={999} currency="MXN" />,
    );
    assert.equal(html, "");
  });
});

describe("PaymentReceipt", () => {
  test("with fee lines: seller line, 1.5% line, MXN total, powered by", () => {
    const html = receipt(ITEMISED);
    assert.match(html, /Booked with Zoe Studio/);
    assert.match(html, /Tulala service fee \(1\.5%\)/);
    assert.match(html, /MX\$1,015\.00 MXN/);
    assert.match(html, /Powered by Tulala/);
  });

  test("Spanish receipt uses the Spanish seller line", () => {
    const html = receipt(ITEMISED, { ...BRAND, locale: "es" });
    assert.match(html, /Reservado con Zoe Studio/);
    assert.match(html, /Desglose del pago/);
  });

  test("missing fee lines: old single-total render", () => {
    const html = receipt({ sellerName: "Zoe Studio" });
    assert.match(html, /MXN 1,015\.00/);
    assert.doesNotMatch(html, /Tulala service fee/);
    assert.doesNotMatch(html, /Powered by Tulala/);
  });

  test("invalid fee lines fall back to the single total", () => {
    const html = receipt({ ...ITEMISED, amountCents: 5 });
    assert.match(html, /MXN 1,015\.00/);
    assert.doesNotMatch(html, /Tulala service fee/);
  });
});

describe("PaymentRefunded", () => {
  const refund = (extra: Record<string, unknown>, brand: EmailBrand = BRAND) =>
    renderToStaticMarkup(
      <PaymentRefunded
        clientName="Ana"
        amount={null}
        bookingUrl="https://zoe.example/client/bookings/b1"
        brand={brand}
        {...extra}
      />,
    );

  test("full refund is localized to Spanish", () => {
    const html = refund({}, { ...BRAND, locale: "es" });
    assert.match(html, /Pago reembolsado/);
    assert.match(html, /método de pago original/);
  });

  test("partial refund shows the amount in English", () => {
    const html = refund({ amount: "MXN 150.00" });
    assert.match(html, /Partial refund issued/);
    assert.match(html, /partial refund of MXN 150\.00/);
  });

  test("dispute heading", () => {
    assert.match(refund({ isDispute: true }), /Payment dispute closed/);
  });
});

describe("Layout seller line", () => {
  test("absent seller renders no seller line", () => {
    const html = renderToStaticMarkup(
      <Layout preview="p" brand={BRAND}>
        x
      </Layout>,
    );
    assert.doesNotMatch(html, /Booked with/);
  });
});

describe("clientManageUrl flag", () => {
  const prev = process.env.CLIENT_ACCOUNT_HOSTS;
  afterEach(() => {
    if (prev === undefined) delete process.env.CLIENT_ACCOUNT_HOSTS;
    else process.env.CLIENT_ACCOUNT_HOSTS = prev;
  });

  test("flag off: legacy path unchanged", () => {
    delete process.env.CLIENT_ACCOUNT_HOSTS;
    assert.equal(
      clientManageUrl(BRAND, "b1", "/client/bookings/b1?tab=payment"),
      "https://zoe.example/client/bookings/b1?tab=payment",
    );
  });

  test("flag on for talent: /account/visits/<id>", () => {
    process.env.CLIENT_ACCOUNT_HOSTS = "talent";
    assert.equal(
      clientManageUrl(BRAND, "b1", "/client/bookings/b1", "talent"),
      "https://zoe.example/account/visits/b1",
    );
  });

  test("flag on for another kind leaves this host unchanged", () => {
    process.env.CLIENT_ACCOUNT_HOSTS = "talent";
    assert.equal(
      clientManageUrl(BRAND, "b1", "/client/bookings/b1", "agency"),
      "https://zoe.example/client/bookings/b1",
    );
  });

  test("no booking id keeps the legacy path even when on", () => {
    process.env.CLIENT_ACCOUNT_HOSTS = "agency";
    assert.equal(
      clientManageUrl(BRAND, null, "/client/bookings"),
      "https://zoe.example/client/bookings",
    );
  });
});
