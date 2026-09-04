import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { StudentGradeProgramType } from "./studentGrades";

export type GradeTemplateSheet = {
  academicYear: string;
  descriptor: string;
  headerOverrides?: Partial<Record<"A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J", string>>;
  rows: string[][];
  sectionCode: string;
  semester: string;
  sheetName: string;
  yearLevel: string;
};

const TEMPLATE_DOWNLOADS: Record<
  StudentGradeProgramType,
  { href: string; fileName: string }
> = {
  SHS: {
    href: `${import.meta.env.BASE_URL}templates/shs_grades_template.xlsx`,
    fileName: "shs_grades_template.xlsx",
  },
  College: {
    href: `${import.meta.env.BASE_URL}templates/college_grades_template.xlsx`,
    fileName: "college_grades_template.xlsx",
  },
};

const TEMPLATE_FIRST_DATA_ROW_INDEX = 6;
const TEMPLATE_DATA_CAPACITY = 19;
const TEMPLATE_DATA_COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const TEMPLATE_FILE_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XML_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XML_REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_PACKAGE_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_EXT_PROPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
const XML_VT_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes";
const XML_NAMESPACE_NS = "http://www.w3.org/XML/1998/namespace";
const WORKSHEET_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const WORKSHEET_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

const getSheetRows = (sheetData: Element) =>
  Array.from(sheetData.childNodes).filter(
    (node): node is Element =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).localName === "row",
  );

const getRowNumber = (row: Element) => Number(row.getAttribute("r") || "0");

const clearCellValue = (cell: Element) => {
  cell.removeAttribute("t");

  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }
};

const setCellInlineString = (cell: Element, value: string) => {
  clearCellValue(cell);

  if (!value) {
    return;
  }

  const document = cell.ownerDocument;
  const inlineString = document.createElementNS(XML_MAIN_NS, "is");
  const textNode = document.createElementNS(XML_MAIN_NS, "t");

  if (/^\s|\s$|\n/.test(value)) {
    textNode.setAttributeNS(XML_NAMESPACE_NS, "xml:space", "preserve");
  }

  textNode.textContent = value;
  inlineString.appendChild(textNode);
  cell.setAttribute("t", "inlineStr");
  cell.appendChild(inlineString);
};

const getCellColumn = (cell: Element, fallbackIndex: number) => {
  const cellReference = cell.getAttribute("r") || "";
  const matchedColumn = cellReference.match(/[A-Z]+/)?.[0];

  return matchedColumn || fallbackIndexToColumn(fallbackIndex);
};

const fallbackIndexToColumn = (index: number) => {
  let value = index + 1;
  let column = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }

  return column;
};

const getRowCellsByColumn = (row: Element) => {
  const cellsByColumn = new Map<string, Element>();

  Array.from(row.childNodes).forEach((node, index) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const cell = node as Element;

    if (cell.localName !== "c") {
      return;
    }

    cellsByColumn.set(getCellColumn(cell, index), cell);
  });

  return cellsByColumn;
};

const copyReferenceRowStyles = (
  targetRow: Element,
  referenceRow: Element,
  columns: string[],
) => {
  const targetCellsByColumn = getRowCellsByColumn(targetRow);
  const referenceCellsByColumn = getRowCellsByColumn(referenceRow);

  columns.forEach((column) => {
    const targetCell = targetCellsByColumn.get(column);
    const referenceCell = referenceCellsByColumn.get(column);
    const referenceStyle = referenceCell?.getAttribute("s");

    if (targetCell && referenceStyle) {
      targetCell.setAttribute("s", referenceStyle);
    }
  });
};

const updateRowNumber = (row: Element, rowNumber: number) => {
  row.setAttribute("r", String(rowNumber));

  Array.from(row.childNodes).forEach((node, index) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const cell = node as Element;

    if (cell.localName !== "c") {
      return;
    }

    const column = getCellColumn(cell, index);
    cell.setAttribute("r", `${column}${rowNumber}`);
  });
};

const getCellByAddress = (sheetData: Element, address: string) => {
  const matchedAddress = address.match(/^([A-Z]+)(\d+)$/);

  if (!matchedAddress) {
    return null;
  }

  const rowNumber = Number(matchedAddress[2]);
  const row = getSheetRows(sheetData).find(
    (rowElement) => getRowNumber(rowElement) === rowNumber,
  );

  if (!row) {
    return null;
  }

  return (
    Array.from(row.childNodes).find(
      (node): node is Element =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).localName === "c" &&
        (node as Element).getAttribute("r") === address,
    ) ?? null
  );
};

const populateStyledTemplateMetadata = ({
  branch,
  sheetData,
  templateType,
  sheet,
}: {
  branch: string;
  sheetData: Element;
  templateType: StudentGradeProgramType;
  sheet: GradeTemplateSheet;
}) => {
  const metadataEntries =
    templateType === "SHS"
      ? [
          ["I3", "PROGRAM:"],
          ["J3", templateType],
          ["C4", "BRANCH:"],
          ["D4", branch],
          ["E4", "SCHOOL YEAR:"],
          ["F4", sheet.academicYear],
          ["G4", "TRACK:"],
          ["H4", sheet.descriptor],
          ["I4", "SEMESTER:"],
          ["J4", sheet.semester],
        ]
      : [
          ["H3", "PROGRAM:"],
          ["I3", templateType],
          ["J3", ""],
          ["C4", "BRANCH:"],
          ["D4", branch],
          ["E4", "SCHOOL YEAR:"],
          ["F4", sheet.academicYear],
          ["G4", "COURSE:"],
          ["H4", sheet.descriptor],
          ["I4", "SEMESTER:"],
          ["J4", sheet.semester],
        ];

  [
    ...metadataEntries,
    ["C5", "SECTION:"],
    ["D5", sheet.sectionCode],
    ["E5", "YEAR LEVEL:"],
    ["F5", sheet.yearLevel],
  ].forEach(([address, value]) => {
    const cell = getCellByAddress(sheetData, address);

    if (cell) {
      setCellInlineString(cell, value);
    }
  });
};

const populateStyledTemplateDataRow = (
  row: Element,
  rowNumber: number,
  rowValues: string[],
) => {
  updateRowNumber(row, rowNumber);
  const cellsByColumn = getRowCellsByColumn(row);

  TEMPLATE_DATA_COLUMNS.forEach((column, index) => {
    const cell = cellsByColumn.get(column);

    if (cell) {
      setCellInlineString(cell, rowValues[index] ?? "");
    }
  });

  const trailingCell = cellsByColumn.get("J");
  if (trailingCell) {
    setCellInlineString(trailingCell, "");
  }
};

const populateStyledTemplateHeaderOverrides = (
  sheetData: Element,
  sheet: GradeTemplateSheet,
) => {
  Object.entries(sheet.headerOverrides ?? {}).forEach(([column, value]) => {
    const cell = getCellByAddress(sheetData, `${column}${TEMPLATE_FIRST_DATA_ROW_INDEX}`);

    if (cell) {
      setCellInlineString(cell, value ?? "");
    }
  });
};

const parseXml = (xmlText: string) =>
  new DOMParser().parseFromString(xmlText, "application/xml");

const serializeXml = (document: Document) =>
  new XMLSerializer().serializeToString(document);

const cloneBytes = (value: Uint8Array) => new Uint8Array(value);

const updateWorksheetDimension = (worksheetDocument: Document, endRow: number) => {
  const dimension =
    worksheetDocument.getElementsByTagNameNS(XML_MAIN_NS, "dimension")[0];

  if (dimension) {
    dimension.setAttribute("ref", `A1:J${Math.max(endRow, 33)}`);
  }
};

const updateWorksheetSelection = (
  worksheetDocument: Document,
  isPrimarySheet: boolean,
) => {
  const primarySheetView =
    worksheetDocument.getElementsByTagNameNS(XML_MAIN_NS, "sheetView")[0];

  if (!primarySheetView) {
    return;
  }

  if (isPrimarySheet) {
    primarySheetView.setAttribute("tabSelected", "1");
    return;
  }

  primarySheetView.removeAttribute("tabSelected");
};

const buildStyledWorksheetXml = ({
  baseWorksheetXml,
  branch,
  sheet,
  templateType,
  isPrimarySheet,
}: {
  baseWorksheetXml: string;
  branch: string;
  sheet: GradeTemplateSheet;
  templateType: StudentGradeProgramType;
  isPrimarySheet: boolean;
}) => {
  const worksheetDocument = parseXml(baseWorksheetXml);
  const sheetData =
    worksheetDocument.getElementsByTagNameNS(XML_MAIN_NS, "sheetData")[0];

  if (!sheetData) {
    throw new Error("The template worksheet is missing sheet data.");
  }

  populateStyledTemplateMetadata({
    branch,
    sheetData,
    templateType,
    sheet,
  });
  populateStyledTemplateHeaderOverrides(sheetData, sheet);
  updateWorksheetSelection(worksheetDocument, isPrimarySheet);

  if (sheet.rows.length === 0) {
    return serializeXml(worksheetDocument);
  }

  const templateRows = getSheetRows(sheetData);
  const rowMap = new Map(templateRows.map((row) => [getRowNumber(row), row]));
  const headerRows = templateRows.filter((row) => getRowNumber(row) <= 6);
  const footerRows = templateRows.filter((row) => getRowNumber(row) >= 26);
  const firstDataTemplate = rowMap.get(7);
  const middleDataTemplate = rowMap.get(8) || firstDataTemplate;
  const lastDataTemplate = rowMap.get(25) || middleDataTemplate || firstDataTemplate;

  if (!firstDataTemplate || !middleDataTemplate || !lastDataTemplate) {
    throw new Error("The template worksheet is missing its data row styles.");
  }

  while (sheetData.firstChild) {
    sheetData.removeChild(sheetData.firstChild);
  }

  headerRows.forEach((row) => {
    sheetData.appendChild(row.cloneNode(true));
  });

  if (sheet.rows.length <= TEMPLATE_DATA_CAPACITY) {
    for (let rowNumber = 7; rowNumber <= 25; rowNumber += 1) {
      const templateRow = rowMap.get(rowNumber);

      if (!templateRow) {
        continue;
      }

      const nextRow = templateRow.cloneNode(true) as Element;
      const dataIndex = rowNumber - 7;

      if (dataIndex < sheet.rows.length) {
        populateStyledTemplateDataRow(
          nextRow,
          rowNumber,
          sheet.rows[dataIndex].slice(0, TEMPLATE_DATA_COLUMNS.length),
        );

        if (dataIndex === 0) {
          copyReferenceRowStyles(nextRow, middleDataTemplate, TEMPLATE_DATA_COLUMNS);
        }
      }

      sheetData.appendChild(nextRow);
    }

    footerRows.forEach((row) => {
      sheetData.appendChild(row.cloneNode(true));
    });
    updateWorksheetDimension(worksheetDocument, 33);
    return serializeXml(worksheetDocument);
  }

  sheet.rows.forEach((rowValues, index) => {
    const rowNumber = TEMPLATE_FIRST_DATA_ROW_INDEX + 1 + index;
    const templateRow =
      index === 0
        ? firstDataTemplate
        : index === sheet.rows.length - 1
          ? lastDataTemplate
          : middleDataTemplate;
    const nextRow = templateRow.cloneNode(true) as Element;

    populateStyledTemplateDataRow(
      nextRow,
      rowNumber,
      rowValues.slice(0, TEMPLATE_DATA_COLUMNS.length),
    );

    if (index === 0) {
      copyReferenceRowStyles(nextRow, middleDataTemplate, TEMPLATE_DATA_COLUMNS);
    }

    sheetData.appendChild(nextRow);
  });

  footerRows.slice(0, 2).forEach((row, index) => {
    const nextRow = row.cloneNode(true) as Element;
    updateRowNumber(
      nextRow,
      TEMPLATE_FIRST_DATA_ROW_INDEX + 1 + sheet.rows.length + index,
    );
    sheetData.appendChild(nextRow);
  });

  updateWorksheetDimension(
    worksheetDocument,
    TEMPLATE_FIRST_DATA_ROW_INDEX + 2 + sheet.rows.length,
  );
  return serializeXml(worksheetDocument);
};

const updateWorkbookXml = ({
  workbookXml,
  sheetNames,
  relationshipIds,
}: {
  workbookXml: string;
  sheetNames: string[];
  relationshipIds: string[];
}) => {
  const workbookDocument = parseXml(workbookXml);
  const sheets = workbookDocument.getElementsByTagNameNS(XML_MAIN_NS, "sheets")[0];

  if (!sheets) {
    throw new Error("The template workbook is missing its sheet list.");
  }

  while (sheets.firstChild) {
    sheets.removeChild(sheets.firstChild);
  }

  sheetNames.forEach((sheetName, index) => {
    const sheet = workbookDocument.createElementNS(XML_MAIN_NS, "sheet");

    sheet.setAttribute("name", sheetName);
    sheet.setAttribute("sheetId", String(index + 1));
    sheet.setAttributeNS(XML_REL_NS, "r:id", relationshipIds[index]);
    sheets.appendChild(sheet);
  });

  return serializeXml(workbookDocument);
};

const updateWorkbookRelationshipsXml = ({
  workbookRelationshipsXml,
  sheetCount,
}: {
  workbookRelationshipsXml: string;
  sheetCount: number;
}) => {
  const relationshipsDocument = parseXml(workbookRelationshipsXml);
  const relationshipsRoot = relationshipsDocument.documentElement;

  Array.from(relationshipsRoot.childNodes).forEach((node) => {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).localName === "Relationship" &&
      (node as Element).getAttribute("Type") === WORKSHEET_RELATIONSHIP_TYPE
    ) {
      relationshipsRoot.removeChild(node);
    }
  });

  const relationshipIds = Array.from({ length: sheetCount }, (_, index) => {
    const relationshipId = `rId${101 + index}`;
    const relationship = relationshipsDocument.createElementNS(
      XML_PACKAGE_REL_NS,
      "Relationship",
    );

    relationship.setAttribute("Id", relationshipId);
    relationship.setAttribute("Type", WORKSHEET_RELATIONSHIP_TYPE);
    relationship.setAttribute("Target", `worksheets/sheet${index + 1}.xml`);
    relationshipsRoot.appendChild(relationship);
    return relationshipId;
  });

  return {
    relationshipIds,
    xml: serializeXml(relationshipsDocument),
  };
};

const updateContentTypesXml = ({
  contentTypesXml,
  sheetCount,
}: {
  contentTypesXml: string;
  sheetCount: number;
}) => {
  const contentTypesDocument = parseXml(contentTypesXml);
  const contentTypesRoot = contentTypesDocument.documentElement;

  Array.from(contentTypesRoot.childNodes).forEach((node) => {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).localName === "Override" &&
      ((node as Element).getAttribute("PartName") || "").startsWith(
        "/xl/worksheets/sheet",
      )
    ) {
      contentTypesRoot.removeChild(node);
    }
  });

  Array.from({ length: sheetCount }, (_, index) => {
    const override = contentTypesDocument.createElementNS(
      contentTypesRoot.namespaceURI,
      "Override",
    );

    override.setAttribute("PartName", `/xl/worksheets/sheet${index + 1}.xml`);
    override.setAttribute("ContentType", WORKSHEET_CONTENT_TYPE);
    contentTypesRoot.appendChild(override);
  });

  return serializeXml(contentTypesDocument);
};

const updateAppPropertiesXml = ({
  appXml,
  sheetNames,
}: {
  appXml: string;
  sheetNames: string[];
}) => {
  const appDocument = parseXml(appXml);
  const headingPairs = appDocument.getElementsByTagNameNS(
    XML_EXT_PROPS_NS,
    "HeadingPairs",
  )[0];
  const titlesOfParts = appDocument.getElementsByTagNameNS(
    XML_EXT_PROPS_NS,
    "TitlesOfParts",
  )[0];

  if (headingPairs) {
    while (headingPairs.firstChild) {
      headingPairs.removeChild(headingPairs.firstChild);
    }

    const vector = appDocument.createElementNS(XML_VT_NS, "vt:vector");
    vector.setAttribute("size", "2");
    vector.setAttribute("baseType", "variant");

    const labelVariant = appDocument.createElementNS(XML_VT_NS, "vt:variant");
    const label = appDocument.createElementNS(XML_VT_NS, "vt:lpstr");
    label.textContent = "Worksheets";
    labelVariant.appendChild(label);

    const countVariant = appDocument.createElementNS(XML_VT_NS, "vt:variant");
    const count = appDocument.createElementNS(XML_VT_NS, "vt:i4");
    count.textContent = String(sheetNames.length);
    countVariant.appendChild(count);

    vector.appendChild(labelVariant);
    vector.appendChild(countVariant);
    headingPairs.appendChild(vector);
  }

  if (titlesOfParts) {
    while (titlesOfParts.firstChild) {
      titlesOfParts.removeChild(titlesOfParts.firstChild);
    }

    const vector = appDocument.createElementNS(XML_VT_NS, "vt:vector");
    vector.setAttribute("size", String(sheetNames.length));
    vector.setAttribute("baseType", "lpstr");

    sheetNames.forEach((sheetName) => {
      const title = appDocument.createElementNS(XML_VT_NS, "vt:lpstr");
      title.textContent = sheetName;
      vector.appendChild(title);
    });

    titlesOfParts.appendChild(vector);
  }

  return serializeXml(appDocument);
};

export const getStyledGradeTemplateFileName = (
  templateType: StudentGradeProgramType,
  prefix = "",
) => {
  const baseFileName = TEMPLATE_DOWNLOADS[templateType].fileName.replace(
    /\.xlsx$/i,
    "",
  );
  const normalizedPrefix = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalizedPrefix
    ? `${normalizedPrefix}_${baseFileName}.xlsx`
    : TEMPLATE_DOWNLOADS[templateType].fileName;
};

export const buildStyledGradeTemplateArchive = async ({
  branch,
  templateType,
  sheets,
}: {
  branch: string;
  templateType: StudentGradeProgramType;
  sheets: GradeTemplateSheet[];
}) => {
  const template = TEMPLATE_DOWNLOADS[templateType];
  const generatedSheets =
    sheets.length > 0
      ? sheets
      : [
          {
            academicYear: "",
            descriptor: "",
            rows: [],
            sectionCode: "",
            semester: "",
            sheetName: "Grades Template",
            yearLevel: "",
          },
        ];
  const templateResponse = await fetch(template.href);

  if (!templateResponse.ok) {
    throw new Error(`Template download failed with status ${templateResponse.status}`);
  }

  const templateBuffer = await templateResponse.arrayBuffer();
  const archiveEntries = unzipSync(new Uint8Array(templateBuffer)) as Record<
    string,
    Uint8Array
  >;
  const baseWorksheetXml = strFromU8(archiveEntries["xl/worksheets/sheet1.xml"]);
  const baseWorksheetRels = archiveEntries["xl/worksheets/_rels/sheet1.xml.rels"];
  const workbookRelationships = updateWorkbookRelationshipsXml({
    workbookRelationshipsXml: strFromU8(
      archiveEntries["xl/_rels/workbook.xml.rels"],
    ),
    sheetCount: generatedSheets.length,
  });

  generatedSheets.forEach((sheet, index) => {
    archiveEntries[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      buildStyledWorksheetXml({
        baseWorksheetXml,
        branch,
        sheet,
        templateType,
        isPrimarySheet: index === 0,
      }),
    );

    if (baseWorksheetRels) {
      archiveEntries[`xl/worksheets/_rels/sheet${index + 1}.xml.rels`] =
        cloneBytes(baseWorksheetRels);
    }
  });

  Object.keys(archiveEntries).forEach((entryName) => {
    const matchedSheetFile = entryName.match(/^xl\/worksheets\/sheet(\d+)\.xml$/);
    const matchedSheetRelFile = entryName.match(
      /^xl\/worksheets\/_rels\/sheet(\d+)\.xml\.rels$/,
    );

    if (
      (matchedSheetFile && Number(matchedSheetFile[1]) > generatedSheets.length) ||
      (matchedSheetRelFile &&
        Number(matchedSheetRelFile[1]) > generatedSheets.length)
    ) {
      delete archiveEntries[entryName];
    }
  });

  archiveEntries["xl/workbook.xml"] = strToU8(
    updateWorkbookXml({
      workbookXml: strFromU8(archiveEntries["xl/workbook.xml"]),
      sheetNames: generatedSheets.map((sheet) => sheet.sheetName),
      relationshipIds: workbookRelationships.relationshipIds,
    }),
  );
  archiveEntries["xl/_rels/workbook.xml.rels"] = strToU8(
    workbookRelationships.xml,
  );
  archiveEntries["[Content_Types].xml"] = strToU8(
    updateContentTypesXml({
      contentTypesXml: strFromU8(archiveEntries["[Content_Types].xml"]),
      sheetCount: generatedSheets.length,
    }),
  );
  archiveEntries["docProps/app.xml"] = strToU8(
    updateAppPropertiesXml({
      appXml: strFromU8(archiveEntries["docProps/app.xml"]),
      sheetNames: generatedSheets.map((sheet) => sheet.sheetName),
    }),
  );

  return zipSync(archiveEntries);
};

export const downloadStyledGradeTemplate = async ({
  branch,
  fileName,
  templateType,
  sheets,
}: {
  branch: string;
  fileName: string;
  templateType: StudentGradeProgramType;
  sheets: GradeTemplateSheet[];
}) => {
  const archive = await buildStyledGradeTemplateArchive({
    branch,
    templateType,
    sheets,
  });
  const blob = new Blob([new Uint8Array(archive).buffer], {
    type: TEMPLATE_FILE_MIME_TYPE,
  });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(downloadUrl);
};
