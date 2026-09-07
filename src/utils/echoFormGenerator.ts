import { AppointmentRecord } from "../services/firebaseAppointments";

/**
 * Auto-calculates age based on Malaysian IC Number.
 * First 2 digits represent the birth year (YY).
 */
export function calculateAgeFromIC(icNumber: string): string {
  if (!icNumber) return "N/A";
  const digitsOnly = icNumber.replace(/[^0-9]/g, "");
  if (digitsOnly.length >= 2) {
    const yy = parseInt(digitsOnly.substring(0, 2), 10);
    if (!isNaN(yy)) {
      const currentYear = new Date().getFullYear();
      const currentYY = currentYear % 100;
      const birthYear = yy > currentYY ? 1900 + yy : 2000 + yy;
      const age = currentYear - birthYear;
      if (age >= 0 && age <= 120) {
        return `${age} Tahun`;
      }
    }
  }
  return "N/A";
}

/**
 * Auto-detects gender based on Malaysian IC Number.
 * Last digit: odd = LELAKI, even = PEREMPUAN.
 */
export function detectGenderFromIC(icNumber: string): string {
  if (!icNumber) return "N/A";
  const digitsOnly = icNumber.replace(/[^0-9]/g, "");
  if (digitsOnly.length > 0) {
    const lastDigit = parseInt(digitsOnly.slice(-1), 10);
    if (!isNaN(lastDigit)) {
      return lastDigit % 2 !== 0 ? "LELAKI" : "PEREMPUAN";
    }
  }
  return "N/A";
}

/**
 * Formats a raw ISO date or timestamp into a clean DD/MM/YYYY string.
 */
export function formatDateOnly(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString("en-GB");
  const datePart = dateStr.split(" @ ")[0].split(" ")[0];
  if (datePart.includes("-")) {
    const parts = datePart.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  return datePart;
}

/**
 * Generates full HTML content matching the official HSI Echo Request Form.
 */
export function generateEchoFormHTML(req: AppointmentRecord): string {
  const isUrgent = req.urgency === "Urgent";
  const age = calculateAgeFromIC(req.mrn);
  const gender = detectGenderFromIC(req.mrn);
  const requestDate = formatDateOnly(req.createdAt);
  const scheduledDateFull = req.scheduledDate || "";
  const scheduledDateOnly = req.scheduledDate ? formatDateOnly(req.scheduledDate) : "";

  let titleText = "ECHOCARDIOGRAM";
  let lastDoneLabel = "Date Last Echo Done:";

  const procType = (req.procedureType || "").toLowerCase();
  if (procType.includes("stress test")) {
    titleText = "EXERCISE STRESS TEST";
    lastDoneLabel = "Date Last Stress Test Done:";
  } else if (procType.includes("holter")) {
    titleText = "24 HOUR HOLTER MONITORING";
    lastDoneLabel = "Date Last Holter Done:";
  }

  return `
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>BORANG PERMOHONAN UJIAN ${titleText} - ${req.patientName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 18mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: "Times New Roman", Times, Georgia, serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #000000;
      background: #ffffff;
      margin: 0;
      padding: 15px 25px;
    }
    .text-center {
      text-align: center;
    }
    .font-bold {
      font-weight: bold;
    }
    
    /* Header Section */
    .logo-container {
      text-align: center;
      margin-bottom: 8px;
    }
    .hsi-logo {
      width: 75px;
      height: auto;
      object-fit: contain;
      display: inline-block;
    }
    .header-text-1 {
      font-size: 12.5pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .header-text-2 {
      font-size: 11.5pt;
      font-weight: bold;
      margin-bottom: 18px;
    }
    
    /* Document Title */
    .doc-title {
      font-size: 11.5pt;
      font-weight: bold;
      margin-bottom: 14px;
      text-transform: uppercase;
    }

    /* Urgency Section */
    .urgency-row {
      display: flex;
      align-items: center;
      margin-bottom: 18px;
      font-weight: bold;
      font-size: 11pt;
    }
    .checkbox-item {
      display: inline-flex;
      align-items: center;
      margin-right: 45px;
    }
    .checkbox-box {
      display: inline-block;
      width: 42px;
      height: 24px;
      border: 1.5px solid #000000;
      margin-left: 12px;
      text-align: center;
      line-height: 22px;
      font-size: 13pt;
      font-weight: bold;
    }

    /* Section Headers */
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 12px;
      text-transform: uppercase;
    }

    /* Form Fields Grid / Tables */
    .field-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .field-table td {
      padding: 4px 0;
      vertical-align: top;
      font-size: 11pt;
    }
    .label {
      font-weight: bold;
      white-space: nowrap;
    }
    .val {
      font-weight: normal;
      padding-left: 8px;
      color: #000000;
    }

    .row-space {
      margin-bottom: 8px;
    }
    .gap-v {
      height: 18px;
    }
    .gap-v-lg {
      height: 35px;
    }

    /* Warning Notice */
    .warning-text {
      font-size: 10pt;
      font-weight: bold;
      margin-top: 18px;
      margin-bottom: 12px;
    }

    /* Divider Line */
    .solid-divider {
      border: none;
      border-top: 2px solid #000000;
      margin: 10px 0 14px 0;
    }

    /* IMC Section */
    .imc-title {
      text-align: center;
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 16px;
      letter-spacing: 0.5px;
    }

    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>

  <!-- Logo -->
  <div class="logo-container">
    <img
      src="/hsi-logo.png"
      alt="Hospital Sultan Ismail"
      class="hsi-logo"
    />
  </div>

  <!-- Header Titles -->
  <div class="text-center header-text-1">KLINIK PAKAR PERUBATAN DALAMAN (IMC)</div>
  <div class="text-center header-text-2">Hospital Sultan Ismail, Johor bahru</div>

  <!-- Document Title -->
  <div class="doc-title">BORANG PERMOHONAN UJIAN ${titleText}.</div>

  <!-- Urgency Checklist -->
  <div class="urgency-row">
    <div class="checkbox-item">
      <span>URGENT</span>
      <span class="checkbox-box">${isUrgent ? "✓" : ""}</span>
    </div>
    <div class="checkbox-item">
      <span>NON URGENT</span>
      <span class="checkbox-box">${!isUrgent ? "✓" : ""}</span>
    </div>
  </div>

  <!-- Patient Details -->
  <div class="section-title">BUTIRAN PESAKIT:</div>

  <table class="field-table">
    <tr>
      <td style="width: 50%;">
        <span class="label">NAMA PESAKIT:</span>
        <span class="val font-bold">${req.patientName || ""}</span>
      </td>
      <td style="width: 50%;">
        <span class="label">NO K.P / PASSPORT :</span>
        <span class="val font-bold">${req.mrn || ""}</span>
      </td>
    </tr>
    <tr>
      <td>
        <span class="label">UMUR:</span>
        <span class="val">${age !== "N/A" ? age : ""}</span>
      </td>
      <td>
        <span class="label">JANTINA:</span>
        <span class="val">${gender !== "N/A" ? gender : ""}</span>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="label">HOSPITAL / KLINIK:</span>
        <span class="val">${req.facilityName || ""}</span>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding-top: 6px;">
        <span class="label">Clinical Finding :</span>
        <span class="val">${req.clinicalIndication || ""}</span>
      </td>
    </tr>
  </table>

  <div class="gap-v"></div>

  <table class="field-table">
    <tr>
      <td colspan="2">
        <span class="label">Diagnosis:</span>
        <span class="val">${req.diagnosis || ""}</span>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="label">${lastDoneLabel}</span>
        <span class="val"></span>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="label">ECG Finding:</span>
        <span class="val"></span>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="label">CXR Finding:</span>
        <span class="val"></span>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="label">Indication:</span>
        <span class="val">${req.clinicalIndication || ""}</span>
      </td>
    </tr>
  </table>

  <div class="gap-v-lg"></div>

  <!-- Doctor Section -->
  <div class="row-space">
    <span class="label">Pegawai Perubatan yang memohon:</span>
    <span class="val font-bold">${req.referringDoctor || ""}</span>
  </div>

  <div class="gap-v"></div>

  <table class="field-table">
    <tr>
      <td style="width: 65%;">
        <span class="label">Tandatangan Dan Cop Rasmi :</span>
        <span class="val"></span>
      </td>
      <td style="width: 35%;">
        <span class="label">Tarikh:</span>
        <span class="val font-bold">${requestDate}</span>
      </td>
    </tr>
  </table>

  <!-- Warning Notice -->
  <div class="warning-text">
    PERINGATAN: Permohonan yang tidak lengkap dan tidak menepati kriteria yang ditetapkan akan ditolak
  </div>

  <!-- Solid Divider Line -->
  <hr class="solid-divider" />

  <!-- IMC Section -->
  <div class="imc-title">UNTUK KEGUNAAN IMC SAHAJA</div>

  <div class="row-space">
    <span class="label">Tarikh dan masa ujian yang ditetapkan:</span>
    <span class="val font-bold">${scheduledDateFull}</span>
  </div>

  <div class="gap-v"></div>

  <table class="field-table">
    <tr>
      <td style="width: 70%;">
        <div class="label">Nama dan t/tangan</div>
        <div class="label">Penolong Pegawai Perubatan:</div>
      </td>
      <td style="width: 30%; vertical-align: bottom;">
        <span class="label">Tarikh:</span>
        <span class="val font-bold">${scheduledDateOnly}</span>
      </td>
    </tr>
  </table>

</body>
</html>
  `;
}

/**
 * Opens the Echo Request Form in a PDF download window / print save prompt.
 */
export function downloadEchoPDFForm(req: AppointmentRecord): void {
  const htmlContent = generateEchoFormHTML(req);
  const pdfWindow = window.open("", "_blank");
  if (pdfWindow) {
    pdfWindow.document.write(htmlContent);
    pdfWindow.document.close();
    pdfWindow.focus();
    setTimeout(() => {
      pdfWindow.print();
    }, 300);
  }
}
