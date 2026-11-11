const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  PageNumber,
  NumberFormat
} = require('docx');

function createCell(text, isHeader = false, widthPercent = null, bold = false) {
  return new TableCell({
    width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
    shading: isHeader
      ? { fill: '800000', type: ShadingType.CLEAR } // Maroon Header
      : undefined,
    margins: { top: 120, bottom: 120, left: 150, right: 150 },
    children: [
      new Paragraph({
        alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: text,
            bold: isHeader || bold,
            color: isHeader ? 'FFFFFF' : '000000',
            size: 20, // 10pt
            font: 'Arial'
          })
        ]
      })
    ]
  });
}

function createParagraph(text, options = {}) {
  const { bold = false, italic = false, spaceAfter = 160, align = AlignmentType.LEFT, bullet = false } = options;
  return new Paragraph({
    alignment: align,
    spacing: { after: spaceAfter, line: 276 }, // 1.15 line spacing
    bullet: bullet ? { level: 0 } : undefined,
    children: [
      new TextRun({
        text,
        bold,
        italic,
        font: 'Arial',
        size: 22 // 11pt
      })
    ]
  });
}

function createHeading(text, level) {
  let size = 28; // 14pt
  let color = '800000'; // Maroon
  if (level === HeadingLevel.HEADING_2) {
    size = 24; // 12pt
    color = '2C3E50';
  } else if (level === HeadingLevel.HEADING_3) {
    size = 22; // 11pt
    color = '34495E';
  }
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        font: 'Arial',
        size,
        color
      })
    ]
  });
}

// Generate the docx
async function generateDoc() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            size: 22
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        children: [
          // Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 100 },
            children: [
              new TextRun({
                text: 'UNIVERSITI TEKNOLOGI MARA (UiTM)',
                bold: true,
                size: 28,
                font: 'Arial',
                color: '800000'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: 'FACULTY OF INFORMATION MANAGEMENT',
                bold: true,
                size: 24,
                font: 'Arial'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: 'IMS568 – INFORMATION MANAGEMENT SYSTEM PROJECT (CAPSTONE)',
                bold: true,
                size: 22,
                font: 'Arial',
                color: '2E7D32'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: 'CAPSTONE PROJECT PROPOSAL REPORT\nAL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)',
                bold: true,
                size: 32,
                font: 'Arial',
                color: '800000'
              })
            ]
          }),
          createParagraph('A Cloud-Based Platform for Ambulance Booking, Dynamic Fare Calculation, Dispatch Coordination, and Trip Documentation', { italic: true, align: AlignmentType.CENTER, spaceAfter: 400 }),

          // Metadata Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [createCell('Host Organisation', true, 30), createCell('Pusat Rawatan Al-Farhain (Al-Farhain Medical Center)', false, 70)] }),
              new TableRow({ children: [createCell('Target Operational Hubs', true, 30), createCell('HQ Kok Lanas (Kelantan) & Cawangan Raub (Pahang)', false, 70)] }),
              new TableRow({ children: [createCell('Course / Subject', true, 30), createCell('IMS568 - Information Management System Project (Capstone)', false, 70)] }),
              new TableRow({ children: [createCell('System Classification', true, 30), createCell('Responsive Web-Based Operational Information System (PWA)', false, 70)] })
            ]
          }),

          createParagraph('', { spaceAfter: 300 }),

          // 1. Introduction
          createHeading('1. Introduction', HeadingLevel.HEADING_1),
          createHeading('1.1 Project Overview & Background', HeadingLevel.HEADING_2),
          createParagraph('Emergency and non-emergency medical transportation constitutes a vital component of the pre-hospital healthcare ecosystem. Private medical centres and ambulance operators in Malaysia play an indispensable role in patient inter-facility transfers, critical care transports, home discharges, and emergency transit. Pusat Rawatan Al-Farhain (Al-Farhain Medical Center - AMC) operates private medical clinics and 24-hour ambulance services covering major regional hubs in Peninsular Malaysia, prominently centered at HQ Pusat Rawatan Al-Farhain (Kok Lanas, Kelantan) and regional branches such as Cawangan Raub (Pahang), Machang, Jeli, Tumpat, and Kuala Krai.'),
          createParagraph('Ambulance operations require rapid, tightly synchronized information workflows involving multiple stakeholders: the caller/patient requesting transit, headquarters (HQ) operations dispatchers, medical emergency response teams (Emergency Medical Technicians - EMTs, Medical Assistants - MAs, Doctors), and receiving medical facilities. The Al-Farhain Ambulance Medical System (AFAMS) is conceptualized as an integrated, cloud-native information management system designed to digitize, automate, and streamline end-to-end ambulance booking, dynamic mileage-based fare estimation, real-time fleet dispatch coordination, driver pre/post-trip safety checks, and electronic handover trip documentation.'),

          createHeading('1.2 Motivation Behind System Selection', HeadingLevel.HEADING_2),
          createParagraph('In private healthcare transport management, operational efficiency directly influences service delivery speed, patient safety, and administrative transparency. Currently, ambulance operations at AMC depend largely on manual calculations, unstructured messaging applications (e.g., WhatsApp groups), phone calls, and paper trip logbooks. This ad-hoc operational model creates significant operational overhead:'),
          createParagraph('1. Fare Estimation Friction: Fare quotations depend on manual distance estimation and mental arithmetic using complex rate tiers, resulting in delayed quotations, billing discrepancies, and customer disputes.', { bullet: true }),
          createParagraph('2. Dispatch Bottlenecks: Dispatchers lack a centralized dashboard showing live vehicle statuses, driver assignments, and trip locations, leading to delayed dispatch and resource contention.', { bullet: true }),
          createParagraph('3. Information Silos in the Field: Drivers and EMT crews record mileage, vehicle readiness, and patient handover notes on loose paper forms, making historical trip verification and billing reconciliation slow and error-prone.', { bullet: true }),
          createParagraph('The motivation behind developing AFAMS is to replace these fragmented, manual procedures with an integrated, reliable Information Management System (IMS). By centralizing data around a unique trip booking identifier, AFAMS establishes an authoritative digital trail from initial quotation through dispatch, navigation, and hospital handover.'),

          createHeading('1.3 System Classification & Operational Scope', HeadingLevel.HEADING_2),
          createParagraph('AFAMS is classified as a Responsive Web-Based Operational and Transactional Information Management System with Progressive Web App (PWA) capabilities. It provides:'),
          createParagraph('• Public Booking & Quotation Portal: Instant route calculation, escort selection (C.A, M.A, Dr), equipment options, and transparent quotation.'),
          createParagraph('• HQ & Branch Operations Command Portal: Fleet readiness monitor, driver dispatch allocation, conflict locking, and invoice issuance.'),
          createParagraph('• Mobile-First Driver Field Portal: Step-by-step task flow, digital pre-trip inspection, navigation link, status progression, and handover logging.'),
          createParagraph('Scope Boundaries: Pilot deployment covers HQ Kok Lanas (Kelantan) and Cawangan Raub (Pahang) with vehicles VPQ 7606 and DFG 7606. Full hospital EHR clinical charting and automated clinical triage algorithms remain outside system boundaries and under qualified medical personnel authority.'),

          createHeading('1.4 Relevance to Real-World Applications', HeadingLevel.HEADING_2),
          createParagraph('The system has direct real-world operational relevance to private ambulance providers across Malaysia. By adhering to pre-hospital standards and using low-cost cloud infrastructure (Supabase PostgreSQL and Vercel Edge Hosting), AFAMS demonstrates a feasible, scalable blueprint for private healthcare logistics without requiring prohibitive capital investments.'),

          // 2. Problem Description
          createHeading('2. Problem Description', HeadingLevel.HEADING_1),
          createHeading('2.1 Problem Definition', HeadingLevel.HEADING_2),
          createParagraph('In emergency medical transport, time-to-dispatch and data accuracy are vital. At Pusat Rawatan Al-Farhain, operational coordination currently relies on disconnected tools: WhatsApp messaging for dispatch, manual Google Maps searching for distance estimates, Excel sheets for pricing, and paper log sheets for odometer readings and hospital sign-offs. This fragmented setup introduces operational friction, latency, and error vulnerability across every stage.'),

          createHeading('2.2 Limitations & Inefficiencies in Existing Solutions', HeadingLevel.HEADING_2),
          createParagraph('1. Inconsistent and Manual Fare Calculation: The Al-Farhain tariff requires a base charge of RM250.00 for the first 25 km, followed by RM3.00 for every additional kilometre, plus variable charges for medical escorts (Clinic Assistant: RM100, Medical Assistant: RM200, Doctor: RM400) and specialized equipment (e.g., Oxygen Tank: RM50, Transport Incubator: RM250, Ventilator: RM150, AED: RM500, Misc Fee: RM50). Manual calculations frequently produce inconsistent rounding and omissions, causing customer disputes.'),
          createParagraph('2. Dispatch Latency & Unstructured Communication: Verbal and WhatsApp dispatches lack automated status tracking or auditable acknowledgment, risking delayed responses during emergencies.'),
          createParagraph('3. Fleet Visibility & Double-Booking Bottlenecks: Without a unified fleet dashboard, dispatchers cannot instantly verify whether an ambulance is active, refuelling, or on mission, creating double-booking vulnerabilities during peak hours.'),
          createParagraph('4. Fragmented Field Documentation: Loose paper checklists for oxygen pressure, suction readiness, and vehicle roadworthiness are easily misplaced. Hospital handover records at emergency departments (e.g., HRPZ II) lack digital traceability.'),
          createParagraph('5. Billing Reconciliation Delays: Compiling trip sheets and reconciling mileage manually delays corporate and individual invoicing by several days.'),

          createHeading('2.3 Real-World Case Studies', HeadingLevel.HEADING_2),
          createParagraph('Case Study 1 - The Inter-State Transfer Dispute: A patient in Kota Bharu required urgent transfer to Hospital Kuala Lumpur (420 km) with oxygen and an M.A escort. Manual mental calculation resulted in an initial phone quotation of RM1,200. Upon arrival, recalculation with correct mileage (RM1,435 transport + RM200 M.A + RM50 O2 + RM50 Misc = RM1,735) caused family distress and accusations of price inflation. AFAMS solves this with an instant, immutable, itemized quotation generated prior to dispatch.'),
          createParagraph('Case Study 2 - Simultaneous Dispatch Contention: Two branch staff simultaneously booked ambulance DFG 7606 for different transfers. With no centralized database, both bookings were accepted, leaving one patient stranded. AFAMS eliminates this via PostgreSQL atomic concurrency locks, preventing simultaneous assignment.'),

          // 3. Objectives
          createHeading('3. Project Objectives', HeadingLevel.HEADING_1),
          createParagraph('The capstone project defines three specific, measurable, achievable, relevant, and time-bound (SMART) objectives:'),
          createParagraph('1. Objective 1 (Booking & Dynamic Fare Automation): To design and develop a responsive, web-based booking and automated dynamic fare calculation module that accurately computes charges based on the official Al-Farhain tariff (RM250.00 base up to 25 km, RM3.00 per subsequent km, medical escort tiers, and equipment add-ons) and generates an instantaneous, itemized quotation with 100% calculation accuracy across all verified test scenarios.', { bold: true }),
          createParagraph('2. Objective 2 (Operations Management & Fleet Dispatch): To implement a centralized, role-based operations and dispatch management portal that enables authorized HQ and branch administrators to manage fleet readiness, allocate ambulances and drivers without double-booking conflicts, and monitor live trip statuses in real time with a synchronization latency of less than 3 seconds.', { bold: true }),
          createParagraph('3. Objective 3 (Driver Field Portal & Handover Documentation): To develop and evaluate a mobile-first driver workflow and trip documentation portal that automates assignment acceptance, digital pre/post-trip safety checklists, GPS route guidance, mileage tracking, and hospital handover recording, achieving an unassisted user task completion rate of at least 85% during operational pilot testing.', { bold: true }),

          // Traceability Table
          createParagraph('', { spaceAfter: 100 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [createCell('Objective', true, 20), createCell('Key Deliverable', true, 30), createCell('Measurable Acceptance Criteria', true, 30), createCell('Evaluation Method', true, 20)] }),
              new TableRow({ children: [createCell('Obj 1: Fare Engine', false, 20, true), createCell('Public Web Booking Portal & Dynamic Tariff Engine', false, 30), createCell('100% passing rate across 20 automated boundary test cases (5km, 25km, 25.01km, 50km, 420km).', false, 30), createCell('Automated unit test suite & supervisor rate card cross-check.', false, 20)] }),
              new TableRow({ children: [createCell('Obj 2: Dispatch Portal', false, 20, true), createCell('HQ & Branch Command Dashboard with Realtime Sync', false, 30), createCell('Zero double-booking occurrences; status sync latency <= 3s over 4G broadband.', false, 30), createCell('Concurrent user simulation & latency logging.', false, 20)] }),
              new TableRow({ children: [createCell('Obj 3: Driver Portal', false, 20, true), createCell('Mobile Driver App with Pre-Trip Check & Handover', false, 30), createCell('>= 85% unassisted task completion rate; 100% mandatory field compliance on completed trips.', false, 30), createCell('Moderated usability trial with 6 EMTs/drivers.', false, 20)] })
            ]
          }),

          createParagraph('', { spaceAfter: 300 }),

          // 4. Literature Survey & Benchmarking
          createHeading('4. Literature Survey & Benchmarking', HeadingLevel.HEADING_1),
          createHeading('4.1 Literature Survey', HeadingLevel.HEADING_2),
          createParagraph('Emergency medical dispatching research highlights the necessity of structured information coordination. Friesen et al. (2024) demonstrated that emergency communication in developing contexts must be organized within structured dispatch workflows rather than relying on informal messaging channels. Bohm & Kurland (2018) highlighted the importance of clear demarcation between administrative dispatch coordination and clinical diagnosis, emphasizing validated data capture, pre-trip vehicle readiness, and auditable trip records. Al-Shaqsi (2010) underscored that integrating GIS distance estimation drastically minimizes billing disputes and response delays.'),
          createParagraph('In cloud architectures, Supabase PostgreSQL with Row-Level Security (RLS) and Change Data Capture (CDC) Realtime WebSockets enables multi-tenant operational security and live synchronization without requiring heavy server maintenance (Supabase, 2024).'),

          createHeading('4.2 Benchmarking Comparison with Three Existing Systems', HeadingLevel.HEADING_2),
          createParagraph('To benchmark AFAMS against established EMS solutions, three industry-standard systems were analyzed: AngelTrack (Cloud EMS/CAD), Traumasoft (Integrated EMS management), and ZOLL Dispatch / RescueNet (Enterprise hospital CAD):'),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [createCell('Dimension', true, 20), createCell('AngelTrack', true, 20), createCell('Traumasoft', true, 20), createCell('ZOLL Dispatch', true, 20), createCell('Proposed AFAMS', true, 20)] }),
              new TableRow({ children: [createCell('Architecture', false, 20, true), createCell('Cloud SaaS (Proprietary)', false, 20), createCell('Cloud SaaS (Proprietary)', false, 20), createCell('Enterprise Hybrid', false, 20), createCell('Cloud Serverless (Vercel + Supabase)', false, 20)] }),
              new TableRow({ children: [createCell('Public Fare Quote', false, 20, true), createCell('No (Call-taker only)', false, 20), createCell('No (Manual entry)', false, 20), createCell('No (Back-office intake)', false, 20), createCell('Yes (Instant dynamic web calculation)', false, 20)] }),
              new TableRow({ children: [createCell('Local Tariff Fit', false, 20, true), createCell('US Medicare / Insurance', false, 20), createCell('US Healthcare Billing', false, 20), createCell('Rigid US Billing Codes', false, 20), createCell('Native Al-Farhain Tariff (RM250+RM3/km)', false, 20)] }),
              new TableRow({ children: [createCell('Driver Interface', false, 20, true), createCell('Web/tablet browser', false, 20), createCell('Mobile application', false, 20), createCell('Dedicated mobile app', false, 20), createCell('Mobile-First Web App (No install)', false, 20)] }),
              new TableRow({ children: [createCell('Handover Log', false, 20, true), createCell('Full ePCR sign-off', false, 20), createCell('ePCR signature', false, 20), createCell('emsCharts integration', false, 20), createCell('Streamlined Operational Handover', false, 20)] }),
              new TableRow({ children: [createCell('Cost / Licensing', false, 20, true), createCell('High ($500-$2000/mo)', false, 20), createCell('High ($1000+/mo)', false, 20), createCell('Extremely High ($10k+)', false, 20), createCell('Low/Zero Cost (Tailored for AMC)', false, 20)] })
            ]
          }),

          createParagraph('', { spaceAfter: 200 }),
          createHeading('4.3 Key Performance Indicators & Evaluation Metrics', HeadingLevel.HEADING_2),
          createParagraph('• Fare Calculation Accuracy: 100% agreement with verified manual rate cards across 20 test vectors.'),
          createParagraph('• Quotation Generation Speed: Reduced from 8-15 minutes (baseline manual) to < 30 seconds.'),
          createParagraph('• Real-Time Sync Latency: 95th percentile <= 3.0 seconds over 4G cellular connections.'),
          createParagraph('• Unassisted Task Completion Rate: >= 85% during moderated driver evaluation sessions.'),
          createParagraph('• Mandatory Record Completeness: 100% compliance at hospital handover closure.'),

          // 5. Methodology
          createHeading('5. Methodology', HeadingLevel.HEADING_1),
          createHeading('5.1 Chosen Methodology: Agile Scrum', HeadingLevel.HEADING_2),
          createParagraph('The system is developed using the Agile Scrum methodology, structured into four two-week sprints following Sprint 0 requirements elicitation. Scrum provides flexibility to refine branch-specific requirements (Kok Lanas HQ vs. Raub Branch), ensures working increments are delivered early, and facilitates rapid feedback from clinic supervisors.'),
          createParagraph('• Sprint 0 (W1-2): Requirements elicitation, rate card analysis, backlog formulation.'),
          createParagraph('• Sprint 1 (W3-5): Supabase schema setup, public booking UI, GIS routing, and dynamic tariff engine.'),
          createParagraph('• Sprint 2 (W6-8): HQ command dashboard, fleet monitor, dispatch allocation, and Realtime WebSockets.'),
          createParagraph('• Sprint 3 (W9-11): Mobile driver portal, digital pre-trip inspection, navigation trigger, and handover logging.'),
          createParagraph('• Sprint 4 (W12-14): Concurrency stress testing, usability evaluation with 6 EMTs, final report compilation.'),

          createHeading('5.2 System Design & Data Flow Diagrams', HeadingLevel.HEADING_2),
          createParagraph('The system architecture decouples client presentation from managed backend services. The Context Diagram (Level 0) models interactions between Caller, Dispatcher, Driver, Routing API, and Payment Gateway. The Level 1 DFD decomposes the system into:'),
          createParagraph('1. Process 1.0: Manage Booking & Fare Calculation (interfacing with D1 Bookings & Tariffs).'),
          createParagraph('2. Process 2.0: Manage Fleet & Resource Dispatch (interfacing with D2 Fleet & Drivers).'),
          createParagraph('3. Process 3.0: Execute Driver Trip & Documentation (interfacing with D3 Trip Events & Checklists).'),
          createParagraph('4. Process 4.0: Generate Invoicing & Audit Logging (interfacing with D4 Invoices & Audit Logs).'),

          createHeading('5.3 Database Design & Data Dictionary', HeadingLevel.HEADING_2),
          createParagraph('The database is implemented in PostgreSQL 15 on Supabase, featuring normalized relational tables:'),
          createParagraph('• ambulance_bookings: Stores primary trip data, origin/destination, distance_km, base fare, extra km cost, escort packages, equipment cost, and status.'),
          createParagraph('• ambulance_fleet: Master vehicle registry (e.g., VPQ 7606, DFG 7606), hub station, vehicle model, and live status (Active, In Mission, Maintenance).'),
          createParagraph('• ambulance_drivers: Master driver/EMT registry, assigned vehicle, license credentials, and duty status.'),
          createParagraph('• equipment_catalogue: Standard medical equipment items (Oxygen Tank, Med Kit, Transport Incubator, Ventilator, AED) and standard pricing.'),
          createParagraph('• trip_checklists: Mandatory digital pre-trip and post-trip safety inspection logs and start odometer.'),
          createParagraph('• trip_closures: Formal hospital handover documentation (receiving nurse, ward, end odometer, total distance km).'),
          createParagraph('• invoices: Versioned financial billing snapshots and settlement statuses.'),
          createParagraph('• audit_events: Immutable administrative logging for all critical resource assignments and tariff updates.'),

          // 6. Work Plan
          createHeading('6. Work Plan & Schedule', HeadingLevel.HEADING_1),
          createParagraph('The project is planned over 14 weeks from initiation to final capstone defense. Milestones M1 to M6 govern phase transitions:'),
          createParagraph('• M1 (End W2): Requirements Backlog & Tariff Base Signed Off.'),
          createParagraph('• M2 (End W5): Database Schema & Dynamic Fare Engine Verified (100% calculation test pass).'),
          createParagraph('• M3 (End W8): Operations Command Portal Operational with Live Dispatch.'),
          createParagraph('• M4 (End W11): Mobile Driver Portal & Handover Workflow Functional.'),
          createParagraph('• M5 (End W13): Usability Trial & Security Audit Results Compiled (>=85% completion rate).'),
          createParagraph('• M6 (End W14): Final Capstone Report & Production Code Handover.'),

          createHeading('6.1 Risk Assessment & Mitigation', HeadingLevel.HEADING_2),
          createParagraph('1. Unstable Cellular Connectivity in Rural Areas: Mitigated by local browser caching (localStorage) and automatic retry synchronization upon network reconnection.'),
          createParagraph('2. Driver Resistance to Complex Mobile Forms: Mitigated by designing high-contrast, large-button interfaces with pre-filled options requiring minimal typing.'),
          createParagraph('3. Scope Creep: Mitigated by strictly bounding the capstone to operational dispatch, fare calculation, and handover, deferring full hospital EHR integration.'),

          // 7. Conclusion
          createHeading('7. Conclusion', HeadingLevel.HEADING_1),
          createParagraph('The Al-Farhain Ambulance Medical System (AFAMS) provides an integrated, cloud-native solution to the operational challenges of private ambulance coordination in Malaysia. By eliminating manual fare calculation errors, reducing dispatch latency through live fleet visibility, and establishing verifiable digital trip documentation, AFAMS enhances operational efficiency, financial integrity, and patient service quality for Pusat Rawatan Al-Farhain.'),
          createParagraph('Academically, the project demonstrates the rigorous application of information systems analysis, database engineering, and Agile methodology to a real-world healthcare logistics problem, fulfilling all core requirements of the IMS568 Capstone Project.'),

          // 8. References
          createHeading('8. References', HeadingLevel.HEADING_1),
          createParagraph('Al-Shaqsi, S. (2010). Models of international emergency medical service (EMS) systems. Oman Medical Journal, 25(4), 320–323. https://doi.org/10.5001/omj.2010.92'),
          createParagraph('AngelTrack. (2024). Cloud-based EMS and ambulance dispatch software. AngelTrack LLC. Retrieved October 25, 2026, from https://angeltrack.com/ems-software-faqs/'),
          createParagraph('Bohm, K., & Kurland, L. (2018). The accuracy of medical dispatch - a systematic review. Scandinavian Journal of Trauma, Resuscitation and Emergency Medicine, 26, Article 94. https://doi.org/10.1186/s13049-018-0528-8'),
          createParagraph('Friesen, J., Kharel, R., & Delaney, P. G. (2024). Emergency medical dispatch technologies: Addressing communication challenges and coordinating emergency response in low and middle-income countries. Surgery, 176(1), 223–225. https://doi.org/10.1016/j.surg.2024.02.031'),
          createParagraph('Google Cloud. (2024). Distance Matrix API overview. Google Developers. Retrieved October 28, 2026, from https://developers.google.com/maps/documentation/distance-matrix'),
          createParagraph('Leaflet. (2024). Leaflet: An open-source JavaScript library for mobile-friendly interactive maps. Retrieved October 25, 2026, from https://leafletjs.com/'),
          createParagraph('Ministry of Health Malaysia. (2021). Pre-hospital care and ambulance services guidelines. Medical Development Division, Ministry of Health Malaysia.'),
          createParagraph('Schwaber, K., & Sutherland, J. (2020). The Scrum Guide: The definitive guide to Scrum - The rules of the game. Scrum.org. https://scrumguides.org/scrum-guide.html'),
          createParagraph('Supabase. (2024a). Postgres changes and realtime CDC guide. Supabase Documentation. Retrieved October 25, 2026, from https://supabase.com/docs/guides/realtime/postgres-changes'),
          createParagraph('Supabase. (2024b). Row Level Security (RLS) deep dive. Supabase Documentation. Retrieved October 25, 2026, from https://supabase.com/docs/guides/database/postgres/row-level-security'),
          createParagraph('Traumasoft. (2024). Integrated EMS CAD and dispatch software. Traumasoft Inc. Retrieved October 25, 2026, from https://traumasoft.com/dispatch/'),
          createParagraph('Vite. (2024). Vite: Next generation frontend tooling. Retrieved October 25, 2026, from https://vite.dev/guide/'),
          createParagraph('World Health Organization. (2020). Emergency medical services systems: Operational guidelines. WHO Guidelines. World Health Organization.'),
          createParagraph('ZOLL Data Systems. (2024). ZOLL Dispatch (RescueNet CAD) product specifications. ZOLL Medical Corporation. Retrieved October 25, 2026, from https://www.zolldata.com/ems-fire/dispatch')
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('Al-Farhain_Ambulance_Proposal_IMS568.docx', buffer);
  console.log('Successfully generated Al-Farhain_Ambulance_Proposal_IMS568.docx!');
}

generateDoc().catch(err => {
  console.error('Error generating docx:', err);
  process.exit(1);
});
