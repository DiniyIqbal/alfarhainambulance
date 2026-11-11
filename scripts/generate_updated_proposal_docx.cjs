const fs = require('fs');
const path = require('path');
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
  AlignmentType,
  ShadingType,
  ImageRun
} = require('docx');

function createCell(text, isHeader = false, widthPercent = null, bold = false) {
  return new TableCell({
    width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
    shading: isHeader
      ? { fill: '800000', type: ShadingType.CLEAR } // Maroon Header
      : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({
            text: text,
            bold: isHeader || bold,
            color: isHeader ? 'FFFFFF' : '000000',
            size: 19, // ~9.5pt
            font: 'Arial'
          })
        ]
      })
    ]
  });
}

function createParagraph(text, options = {}) {
  const { bold = false, italic = false, spaceAfter = 140, align = AlignmentType.LEFT, bullet = false } = options;
  return new Paragraph({
    alignment: align,
    spacing: { after: spaceAfter, line: 260 },
    bullet: bullet ? { level: 0 } : undefined,
    children: [
      new TextRun({
        text,
        bold,
        italic,
        font: 'Arial',
        size: 21 // 10.5pt
      })
    ]
  });
}

function createHeading(text, level) {
  let size = 26; // 13pt
  let color = '800000'; // Maroon
  if (level === HeadingLevel.HEADING_2) {
    size = 23; // 11.5pt
    color = '2C3E50';
  } else if (level === HeadingLevel.HEADING_3) {
    size = 21; // 10.5pt
    color = '34495E';
  }
  return new Paragraph({
    heading: level,
    spacing: { before: 200, after: 100 },
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

function createImageParagraph(imagePath, width, height, captionText) {
  const imgData = fs.readFileSync(imagePath);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 80 },
      children: [
        new ImageRun({
          data: imgData,
          transformation: {
            width,
            height
          }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 180 },
      children: [
        new TextRun({
          text: captionText,
          bold: true,
          italic: true,
          font: 'Arial',
          size: 19,
          color: '555555'
        })
      ]
    })
  ];
}

async function buildProposalDocument() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            size: 21
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        children: [
          // Title & Metadata
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 300, after: 80 },
            children: [
              new TextRun({
                text: 'UNIVERSITI TEKNOLOGI MARA (UiTM)',
                bold: true,
                size: 26,
                font: 'Arial',
                color: '800000'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: 'FACULTY OF INFORMATION MANAGEMENT',
                bold: true,
                size: 22,
                font: 'Arial'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 250 },
            children: [
              new TextRun({
                text: 'IMS568 – INFORMATION MANAGEMENT SYSTEM PROJECT (CAPSTONE)',
                bold: true,
                size: 20,
                font: 'Arial',
                color: '2E7D32'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: 'CAPSTONE PROJECT PROPOSAL REPORT\nAL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)',
                bold: true,
                size: 28,
                font: 'Arial',
                color: '800000'
              })
            ]
          }),
          createParagraph('A Cloud-Based Platform for Ambulance Booking, Dynamic Fare Calculation, Dispatch Coordination, and Trip Documentation', { italic: true, align: AlignmentType.CENTER, spaceAfter: 300 }),

          // Scope Metadata Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [createCell('Host Organisation', true, 30), createCell('Pusat Rawatan Al-Farhain (Al-Farhain Medical Center)', false, 70)] }),
              new TableRow({ children: [createCell('Operational Hubs', true, 30), createCell('HQ Pusat Rawatan Al-Farhain (Kok Lanas, Kelantan) & Cawangan Raub (Pahang)', false, 70)] }),
              new TableRow({ children: [createCell('Assigned Fleet & Staff', true, 30), createCell('Ambulance VPQ 7606 (Abe Di/Syalihan) & DFG 7606 (Abe Din Estimos Sukrosa)', false, 70)] }),
              new TableRow({ children: [createCell('Course / Subject', true, 30), createCell('IMS568 - Information Management System Project (Capstone)', false, 70)] }),
              new TableRow({ children: [createCell('System Classification', true, 30), createCell('Responsive Web-Based Operational & Transactional Information System (PWA)', false, 70)] })
            ]
          }),

          createParagraph('', { spaceAfter: 200 }),

          // 1. Introduction
          createHeading('1. Introduction', HeadingLevel.HEADING_1),
          createHeading('1.1 Project Overview & Motivation', HeadingLevel.HEADING_2),
          createParagraph('Emergency and non-emergency medical transportation constitutes a vital component of pre-hospital care in Malaysia. Pusat Rawatan Al-Farhain (Al-Farhain Medical Center - AMC) operates private 24-hour medical centres and ambulance services covering prominent regional hubs in Kelantan (Kok Lanas HQ, Jeli, Machang, Tumpat, Tunjung, Kuala Krai) and Pahang (Cawangan Raub, Cameron Highlands, Kuala Lipis).'),
          createParagraph('Currently, ambulance booking, fare estimation, dispatch communication, and trip tracking at AMC depend on disconnected tools: WhatsApp messaging groups, mental/manual calculations from printed rate sheets, and paper logbooks. This ad-hoc model causes quotation delays, price inconsistencies, dispatch contention, and misplaced patient handover logs. The Al-Farhain Ambulance Medical System (AFAMS) is conceptualized as an integrated, cloud-native information management system that structures, automates, and unifies the entire lifecycle around a unique trip booking identifier.'),

          createHeading('1.2 System Type & Operational Scope', HeadingLevel.HEADING_2),
          createParagraph('AFAMS is classified as a Responsive Web-Based Operational and Transactional Information Management System with Progressive Web App (PWA) capabilities. It provides:'),
          createParagraph('1. Public Booking & Fare Calculation Portal: Instant GIS route distance estimation, dynamic Al-Farhain tariff calculation, escort selection (Clinic Assistant: RM100, Medical Assistant: RM200, Doctor: RM400), equipment add-ons, and itemized quotation generation.', { bullet: true }),
          createParagraph('2. HQ & Branch Operations Management Portal: Centralized dashboard for operations managers to monitor fleet readiness, allocate drivers and vehicles with atomic concurrency locking, and track live trip progress.', { bullet: true }),
          createParagraph('3. Mobile-First Driver Field Portal: Step-by-step smartphone workflow supporting assignment acknowledgement, digital pre-trip inspection checklists, Google Maps navigation handoff, real-time status progression, and hospital handover recording.', { bullet: true }),
          createParagraph('Scope Boundaries: Pilot deployment is scoped to HQ Kok Lanas and Cawangan Raub. Full hospital EHR clinical charting and automated clinical triage algorithms are explicitly outside system boundaries and remain under the clinical authority of certified EMTs and medical doctors.'),

          // 2. Problem Description
          createHeading('2. Problem Description', HeadingLevel.HEADING_1),
          createHeading('2.1 Core Problem Statement', HeadingLevel.HEADING_2),
          createParagraph('The absence of an integrated digital information pipeline connecting customer requests, fare estimation, fleet allocation, and field trip records introduces significant administrative friction and error vulnerability.'),
          createParagraph('• Manual & Inconsistent Fare Calculation: Staff compute distance manually on consumer map apps, often misapplying the base tariff (RM250.00 for the first 25 km, RM3.00/km thereafter), miscalculating escort tiers, or omitting equipment surcharges. This leads to customer mistrust when billed amounts diverge from initial verbal quotes.', { bullet: true }),
          createParagraph('• Dispatch Latency & Unstructured Messaging: Relaying emergency calls through WhatsApp groups results in missed messages, delayed responses, and an absence of timestamped acknowledgements.', { bullet: true }),
          createParagraph('• Double-Booking Contention: Without centralized fleet visibility, dispatchers across branches risk double-booking an ambulance during peak operational windows.', { bullet: true }),
          createParagraph('• Fragmented Paper Documentation: Vehicle checklists (oxygen pressure, suction batteries, stretcher safety) and hospital handover records are recorded on loose paper sheets that are easily damaged or lost.', { bullet: true }),

          createHeading('2.2 Real-World Case Studies', HeadingLevel.HEADING_2),
          createParagraph('Case Study A - Inter-State Transfer Dispute: An urgent transfer from Kok Lanas to Hospital Kuala Lumpur (420 km) with oxygen and an M.A escort was verbally quoted at RM1,200 by a clinic clerk. Upon trip completion, recalculation using official rates produced RM1,735 (RM1,435 transport + RM200 M.A + RM50 O2 + RM50 Misc), causing extreme customer distress. AFAMS eliminates this by computing immutable, itemized quotations prior to dispatch confirmation.'),
          createParagraph('Case Study B - Simultaneous Dispatch Collision: Two branch coordinators simultaneously booked ambulance DFG 7606 for different patients because neither had visibility of the other\'s paper logbook. AFAMS eliminates this through database-level transactional resource locking.'),

          // 3. Objectives
          createHeading('3. Project Objectives', HeadingLevel.HEADING_1),
          createParagraph('The capstone project defines three clear, measurable objectives to evaluate project success:'),
          createParagraph('1. Objective 1 (Booking & Dynamic Fare Automation): To design and develop a responsive web booking and dynamic fare calculation module that enforces the official Al-Farhain tariff (RM250 base up to 25 km, RM3/km subsequent, escort tiers, equipment add-ons) with 100% calculation accuracy across 20 verified test scenarios.', { bold: true }),
          createParagraph('2. Objective 2 (Operations Management & Dispatch Coordination): To implement a centralized, role-based operations dashboard that enables authorized staff to manage fleet readiness, allocate ambulances and drivers without double-booking conflicts, and monitor live status with a sync latency of less than 3 seconds.', { bold: true }),
          createParagraph('3. Objective 3 (Driver Field Portal & Handover Documentation): To develop and evaluate a mobile-first driver workflow portal that automates assignment acceptance, digital pre-trip safety checklists, GPS navigation launch, and hospital handover recording, achieving an unassisted task completion rate of at least 85% during operational evaluation.', { bold: true }),

          // Traceability Table
          createParagraph('', { spaceAfter: 80 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [createCell('Objective', true, 20), createCell('Key Deliverable', true, 30), createCell('Measurable Acceptance Criteria', true, 30), createCell('Evaluation Method', true, 20)] }),
              new TableRow({ children: [createCell('Obj 1: Fare Engine', false, 20, true), createCell('Public Web Booking Portal & Dynamic Tariff Engine', false, 30), createCell('100% passing rate on 20 automated calculation test cases (e.g., 5km, 25km, 25.01km, 50km, 420km).', false, 30), createCell('Automated unit test suite & supervisor rate cross-check.', false, 20)] }),
              new TableRow({ children: [createCell('Obj 2: Dispatch Portal', false, 20, true), createCell('HQ & Branch Management Dashboard with Realtime Sync', false, 30), createCell('Zero double-booking occurrences; status sync latency <= 3.0s over 4G broadband.', false, 30), createCell('Concurrent user simulation & latency logging.', false, 20)] }),
              new TableRow({ children: [createCell('Obj 3: Driver Portal', false, 20, true), createCell('Mobile Driver App with Pre-Trip Checklist & Handover', false, 30), createCell('>= 85% unassisted task completion rate; 100% mandatory field compliance on completed trips.', false, 30), createCell('Moderated usability trial with 6 EMTs/drivers.', false, 20)] })
            ]
          }),

          createParagraph('', { spaceAfter: 200 }),

          // 4. Literature Survey & Benchmarking
          createHeading('4. Literature Survey & Benchmarking', HeadingLevel.HEADING_1),
          createHeading('4.1 Literature Survey', HeadingLevel.HEADING_2),
          createParagraph('Emergency medical dispatch research emphasizes that emergency communication must be embedded within structured dispatch workflows rather than unstructured messaging channels (Friesen et al., 2024). Bohm & Kurland (2018) highlighted the importance of clear separation between administrative coordination and clinical diagnosis, emphasizing validated data capture, pre-trip vehicle readiness, and auditable trip records. Al-Shaqsi (2010) demonstrated that integrating GIS distance estimation drastically minimizes billing disputes and response delays.'),
          createParagraph('In cloud architectures, Supabase PostgreSQL with Row-Level Security (RLS) and Change Data Capture (CDC) Realtime WebSockets enables multi-tenant operational security and live synchronization without requiring heavy server maintenance (Supabase, 2024).'),

          createHeading('4.2 Benchmarking Comparison with Three Existing Systems', HeadingLevel.HEADING_2),
          createParagraph('AFAMS was benchmarked against three industry-standard commercial platforms: AngelTrack (Cloud EMS/CAD), Traumasoft (Integrated EMS management), and ZOLL Dispatch / RescueNet (Enterprise hospital CAD):'),

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

          // 5. Methodology
          createHeading('5. Methodology & System Design', HeadingLevel.HEADING_1),
          createHeading('5.1 Chosen Methodology: Agile Scrum', HeadingLevel.HEADING_2),
          createParagraph('The project is developed using the Agile Scrum methodology, structured across four two-week sprints following Sprint 0 requirements elicitation. Scrum provides the necessary flexibility to refine branch-specific requirements between Kok Lanas HQ and Raub Branch, ensures working software increments are delivered early, and facilitates continuous feedback from AMC clinic supervisors.'),

          // 5.2 Context Data Flow Diagram
          createHeading('5.2 Context Data Flow Diagram (Level 0 DFD)', HeadingLevel.HEADING_2),
          createParagraph('The Context Diagram models the Al-Farhain Ambulance Medical System (AFAMS) as a single central process (Process 0) and establishes the strict information boundaries between the system and its four primary external entities:'),
          createParagraph('• Patient or Caller: Initiates the service by submitting trip requests (origin, destination, required medical assistance, equipment requirements). In return, the system generates an instant itemized fare quotation, unique tracking reference, and the finalized invoice upon trip completion.'),
          createParagraph('• HQ or Branch Operator: Configures operational parameters, updates approved tariff schedules, verifies incoming bookings, and assigns available ambulances and drivers. The operator dashboard receives real-time booking updates, fleet readiness statuses, and trip/invoice summaries.'),
          createParagraph('• Driver or Crew: Receives assignment details, trip instructions, and checklist requirements. The driver transmits assignment acknowledgement, digital pre-trip inspection logs, starting odometer, real-time lifecycle status transitions, hospital handover details, and closing odometer readings.'),
          createParagraph('• Map and Route Service: Receives origin and destination coordinates and returns computed road distance (in km) and route geometry. Patient names, clinical notes, and private contact numbers are strictly withheld from the routing service to maintain patient privacy.'),

          ...createImageParagraph(
            path.resolve('diagrams/figure3_context_dfd.png'),
            480,
            470,
            'Figure 3: AFAMS Context Data Flow Diagram (Process 0)'
          ),

          createParagraph('As demonstrated in Figure 3, external roles interact solely through secured, role-delineated interfaces. No internal data stores are depicted at this abstract level, maintaining standard Gane–Sarson context diagram notation.'),

          // 5.3 Level 1 Data Flow Decomposition
          createHeading('5.3 Data Flow Decomposition (Level 1 DFD)', HeadingLevel.HEADING_2),
          createParagraph('The Level 1 Data Flow Diagram decomposes the system into four discrete functional processes and four primary data stores using Gane–Sarson notation. External entities appear on the left, numbered processes occupy the centre, and open-ended data stores are positioned on the right:'),
          createParagraph('• Process 1.0 (Validate Request and Calculate Estimate): Accepts caller request details, communicates with the Map and Route Service to obtain verified road distance, queries Data Store D1 (Booking and Tariff Records) for active base and excess mileage rates, computes the total fare, and commits the booking record while returning an itemized estimate to the caller.'),
          createParagraph('• Process 2.0 (Review Request and Assign Resources): Enables HQ and branch operators to inspect unassigned bookings in D1, checks vehicle and driver availability in Data Store D2 (Staff and Vehicle Records), commits resource allocations, updates vehicle readiness to In Mission, and transmits assignment notifications to the assigned driver.'),
          createParagraph('• Process 3.0 (Execute Trip and Record Handover): Coordinates field execution. The driver retrieves assignment details from D2, logs pre-trip readiness checklists and start odometer into Data Store D3 (Trip and Checklist Records), advances mission statuses, and records final hospital handover data upon arrival at the destination medical facility.'),
          createParagraph('• Process 4.0 (Finalise Records and Generate Invoice): Consolidates approved charges from D1 and verified completion data from D3, produces official invoice documents, records immutable audit trails in Data Store D4 (Invoice and Audit Records), delivers the final invoice to the patient/caller, and outputs operational summaries to the management dashboard.'),

          ...createImageParagraph(
            path.resolve('diagrams/figure4_level1_dfd.png'),
            450,
            580,
            'Figure 4: AFAMS Level 1 Data Flow Diagram (Decomposition)'
          ),

          createParagraph('Figure 4 maintains strict input-output balance with the Context Diagram, ensuring that every data stream crossing the external boundary in Process 0 is fully accounted for across the decomposed subprocesses.'),

          // 5.4 Database Design & Entity Relationship Diagrams
          createHeading('5.4 Database Design & Entity Relationship Diagrams (ERD)', HeadingLevel.HEADING_2),
          createParagraph('The AFAMS logical database architecture is structured in Third Normal Form (3NF), separating master registry data from dynamic booking transactions, field execution logs, and financial snapshots. The database schema is visualized through two complementary architectural diagrams:'),

          createHeading('5.4.1 Master Registry & Booking Core Relationships', HeadingLevel.HEADING_3),
          createParagraph('Figure 5 illustrates the core entities governing branches, staff credentials, fleet vehicles, immutable tariff versions, bookings, ordered route stops, and historical assignment allocations:'),

          ...createImageParagraph(
            path.resolve('diagrams/figure5_core_erd.png'),
            520,
            325,
            'Figure 5: AFAMS Core Entity Relationships (Master & Booking Core)'
          ),

          createParagraph('Key Relational Rules in Figure 5:'),
          createParagraph('• Branch Multi-Tenancy: One branch coordinates many staff members, stations many fleet vehicles, and oversees many trip bookings. Foreign key constraints enforce branch data scoping.', { bullet: true }),
          createParagraph('• Tariff Immutability: Each booking permanently references the specific tariff_id under which its fare was computed. When administrative rate adjustments occur, historical booking quotations remain unaffected.', { bullet: true }),
          createParagraph('• Dynamic Stops: The booking_stops table supports ordered multi-stop transfers with sequence numbers and validated geographical coordinates.', { bullet: true }),
          createParagraph('• Assignment Traceability & Conflict Prevention: The trip_assignments entity retains a complete historical audit trail of all allocations. A partial unique index on active states ensures that neither an ambulance nor a driver can have more than one active mission simultaneously, mathematically preventing double-booking.', { bullet: true }),

          createHeading('5.4.2 Trip Execution, Equipment & Transaction Relationships', HeadingLevel.HEADING_3),
          createParagraph('Figure 6 illustrates the entities governing operational field execution, safety inspection checklists, equipment catalogue mapping, and immutable financial invoice generation:'),

          ...createImageParagraph(
            path.resolve('diagrams/figure6_trip_erd.png'),
            520,
            325,
            'Figure 6: AFAMS Trip Execution, Equipment & Transaction Entity Relationships'
          ),

          createParagraph('Key Relational Rules in Figure 6:'),
          createParagraph('• Inspection Verification: The trip_checklists table captures pre-trip and post-trip readiness confirmations and start odometer readings.', { bullet: true }),
          createParagraph('• Lifecycle State Machine: The trip_events table records timestamped status changes with unique client event tokens, ensuring idempotent submissions even over intermittent mobile connections.', { bullet: true }),
          createParagraph('• Handover Closure: The trip_closures entity enforces a strict 1-to-1 relationship with bookings, requiring recipient nurse names, destination ward, end odometer readings, and auto-generated total road distance.', { bullet: true }),
          createParagraph('• Equipment Mapping: The booking_equipment associative entity resolves the many-to-many relationship between bookings and the equipment_catalogue, capturing agreed unit prices as snapshots.', { bullet: true }),
          createParagraph('• Financial Immutability: Invoices capture versioned line items and totals, preventing retro-active alteration of issued customer bills.', { bullet: true }),

          // 5.5 Detailed Data Dictionary
          createHeading('5.5 Application Data Dictionary', HeadingLevel.HEADING_2),
          createParagraph('The following tables specify the PostgreSQL database implementation on Supabase:'),

          createParagraph('Table 1: ambulance_bookings (Core Trip Records)', { bold: true }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [createCell('Field Name', true, 25), createCell('Data Type', true, 20), createCell('Constraint', true, 25), createCell('Description', true, 30)] }),
              new TableRow({ children: [createCell('id', false, 25, true), createCell('UUID', false, 20), createCell('PK, DEFAULT gen_random_uuid()', false, 25), createCell('Unique primary key for booking record.', false, 30)] }),
              new TableRow({ children: [createCell('invoice_number', false, 25, true), createCell('VARCHAR(50)', false, 20), createCell('UNIQUE, NOT NULL', false, 25), createCell('Unique billing reference (e.g., INV-20261109-001).', false, 30)] }),
              new TableRow({ children: [createCell('hub_id', false, 25, true), createCell('VARCHAR(50)', false, 20), createCell('NOT NULL', false, 25), createCell('Originating branch hub (kok_lanas / raub).', false, 30)] }),
              new TableRow({ children: [createCell('origin_name', false, 25, true), createCell('TEXT', false, 20), createCell('NOT NULL', false, 25), createCell('Human-readable pickup address/landmark.', false, 30)] }),
              new TableRow({ children: [createCell('destination_name', false, 25, true), createCell('TEXT', false, 20), createCell('NOT NULL', false, 25), createCell('Destination hospital/clinic facility.', false, 30)] }),
              new TableRow({ children: [createCell('distance_km', false, 25, true), createCell('NUMERIC(8,2)', false, 20), createCell('NOT NULL, CHECK >= 0', false, 25), createCell('Calculated one-way road distance in km.', false, 30)] }),
              new TableRow({ children: [createCell('base_fare', false, 25, true), createCell('NUMERIC(10,2)', false, 20), createCell('NOT NULL', false, 25), createCell('Base charge for first 25 km (RM250.00).', false, 30)] }),
              new TableRow({ children: [createCell('extra_km_cost', false, 25, true), createCell('NUMERIC(10,2)', false, 20), createCell('DEFAULT 0.00', false, 25), createCell('Surcharge for distance > 25 km (RM3.00/km).', false, 30)] }),
              new TableRow({ children: [createCell('assistance_package', false, 25, true), createCell('TEXT', false, 20), createCell('NOT NULL', false, 25), createCell('Medical escort tier (None, C.A, M.A, Doctor).', false, 30)] }),
              new TableRow({ children: [createCell('assistance_cost', false, 25, true), createCell('NUMERIC(10,2)', false, 20), createCell('DEFAULT 0.00', false, 25), createCell('Charge for selected escort (RM0-RM400).', false, 30)] }),
              new TableRow({ children: [createCell('equipment_cost', false, 25, true), createCell('NUMERIC(10,2)', false, 20), createCell('DEFAULT 0.00', false, 25), createCell('Aggregate charge for specialized equipment.', false, 30)] }),
              new TableRow({ children: [createCell('misc_fee', false, 25, true), createCell('NUMERIC(10,2)', false, 20), createCell('DEFAULT 50.00', false, 25), createCell('Administrative and sanitation fee (RM50.00).', false, 30)] }),
              new TableRow({ children: [createCell('total_fare', false, 25, true), createCell('NUMERIC(10,2)', false, 20), createCell('NOT NULL', false, 25), createCell('Final payable fare snapshot.', false, 30)] }),
              new TableRow({ children: [createCell('plate_number', false, 25, true), createCell('VARCHAR(20)', false, 20), createCell('NOT NULL', false, 25), createCell('Assigned vehicle plate (VPQ 7606 / DFG 7606).', false, 30)] }),
              new TableRow({ children: [createCell('driver_name', false, 25, true), createCell('VARCHAR(100)', false, 20), createCell('NOT NULL', false, 25), createCell('Assigned driver / EMT personnel.', false, 30)] }),
              new TableRow({ children: [createCell('status', false, 25, true), createCell('VARCHAR(50)', false, 20), createCell('DEFAULT "Dispatched"', false, 25), createCell('Mission state: Dispatched, En Route, Arrived, etc.', false, 30)] })
            ]
          }),

          createParagraph('', { spaceAfter: 100 }),
          createParagraph('Table 2: ambulance_fleet (Fleet Master Registry)', { bold: true }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [createCell('Field Name', true, 25), createCell('Data Type', true, 20), createCell('Constraint', true, 25), createCell('Description', true, 30)] }),
              new TableRow({ children: [createCell('id', false, 25, true), createCell('UUID', false, 20), createCell('PK, DEFAULT gen_random_uuid()', false, 25), createCell('Unique vehicle identifier.', false, 30)] }),
              new TableRow({ children: [createCell('plate_number', false, 25, true), createCell('VARCHAR(20)', false, 20), createCell('UNIQUE, NOT NULL', false, 25), createCell('Official vehicle plate number.', false, 30)] }),
              new TableRow({ children: [createCell('hub_id', false, 25, true), createCell('VARCHAR(50)', false, 20), createCell('NOT NULL', false, 25), createCell('Base station hub identifier.', false, 30)] }),
              new TableRow({ children: [createCell('model', false, 25, true), createCell('TEXT', false, 20), createCell('DEFAULT "Toyota Hiace"', false, 25), createCell('Vehicle specification and build.', false, 30)] }),
              new TableRow({ children: [createCell('status', false, 25, true), createCell('VARCHAR(50)', false, 20), createCell('DEFAULT "Active"', false, 25), createCell('Readiness: Active, In Mission, Maintenance.', false, 30)] }),
              new TableRow({ children: [createCell('current_driver', false, 25, true), createCell('VARCHAR(100)', false, 20), createCell('NULL', false, 25), createCell('Currently assigned primary driver.', false, 30)] }),
              new TableRow({ children: [createCell('hotline', false, 25, true), createCell('VARCHAR(50)', false, 20), createCell('DEFAULT "013-914 7606"', false, 25), createCell('Operational hotline for this unit.', false, 30)] })
            ]
          }),

          createParagraph('', { spaceAfter: 200 }),

          // 6. Work Plan
          createHeading('6. Work Plan & Schedule', HeadingLevel.HEADING_1),
          createParagraph('The capstone project is structured across 14 relative weeks, covering five core phases and six milestone gates:'),
          createParagraph('• Phase 1 (Weeks 1-2): Requirements elicitation, workflow observation, and product backlog formulation. Milestone M1: Requirements & Tariff Base Signed Off.'),
          createParagraph('• Phase 2 (Weeks 3-5): Database modeling, Supabase setup, and booking fare calculation engine. Milestone M2: Database Schema & Fare Engine Verified.'),
          createParagraph('• Phase 3 (Weeks 6-8): Operations command dashboard, fleet monitor, and Realtime WebSockets dispatch. Milestone M3: Operations Command Portal Operational.'),
          createParagraph('• Phase 4 (Weeks 9-11): Mobile driver portal, pre-trip checklists, navigation trigger, and handover logging. Milestone M4: Driver Mobile Portal Functional.'),
          createParagraph('• Phase 5 (Weeks 12-14): Concurrency stress testing, moderated usability evaluation with 6 EMTs, and final report defense. Milestones M5 & M6: Evaluation Compiled & Project Handover.'),

          createHeading('6.1 Gantt Schedule Matrix', HeadingLevel.HEADING_2),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [createCell('Work Package', true, 30), createCell('W1-2', true, 14), createCell('W3-5', true, 14), createCell('W6-8', true, 14), createCell('W9-11', true, 14), createCell('W12-14', true, 14)] }),
              new TableRow({ children: [createCell('Requirements & Benchmarking', false, 30, true), createCell('█████', false, 14), createCell('', false, 14), createCell('', false, 14), createCell('', false, 14), createCell('', false, 14)] }),
              new TableRow({ children: [createCell('Architecture, DFD & ERD Design', false, 30, true), createCell('', false, 14), createCell('█████', false, 14), createCell('', false, 14), createCell('', false, 14), createCell('', false, 14)] }),
              new TableRow({ children: [createCell('Dynamic Fare Calculator Module', false, 30, true), createCell('', false, 14), createCell('█████', false, 14), createCell('', false, 14), createCell('', false, 14), createCell('', false, 14)] }),
              new TableRow({ children: [createCell('Operations & Dispatch Portal', false, 30, true), createCell('', false, 14), createCell('', false, 14), createCell('█████', false, 14), createCell('', false, 14), createCell('', false, 14)] }),
              new TableRow({ children: [createCell('Driver Portal & Handover Log', false, 30, true), createCell('', false, 14), createCell('', false, 14), createCell('', false, 14), createCell('█████', false, 14), createCell('', false, 14)] }),
              new TableRow({ children: [createCell('Usability Trials & Final Report', false, 30, true), createCell('', false, 14), createCell('', false, 14), createCell('', false, 14), createCell('', false, 14), createCell('█████', false, 14)] })
            ]
          }),

          createParagraph('', { spaceAfter: 200 }),

          // 7. Conclusion
          createHeading('7. Conclusion', HeadingLevel.HEADING_1),
          createParagraph('The Al-Farhain Ambulance Medical System (AFAMS) delivers a tailored, cloud-native information management solution for private medical transport in Malaysia. By replacing error-prone manual spreadsheets, phone dispatches, and paper trip sheets with an integrated web platform, AFAMS ensures mathematical fare accuracy, prevents double-booking conflicts, and establishes permanent, auditable trip records for Pusat Rawatan Al-Farhain.'),
          createParagraph('The structural models presented—including the Context Diagram (Figure 3), Level 1 Data Flow Diagram (Figure 4), and Entity Relationship Diagrams (Figures 5 & 6)—provide a complete, rigorous engineering blueprint that satisfies all academic requirements of the IMS568 Capstone Project while creating an operational asset for the healthcare provider.'),

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
  
  // Write to Updated file
  fs.writeFileSync('Al-Farhain_Ambulance_Proposal_IMS568_Updated.docx', buffer);
  console.log('Successfully wrote Al-Farhain_Ambulance_Proposal_IMS568_Updated.docx (Size: ' + buffer.length + ' bytes)');
  
  // Attempt to overwrite original if not locked
  try {
    fs.writeFileSync('Al-Farhain_Ambulance_Proposal_IMS568.docx', buffer);
    console.log('Successfully updated Al-Farhain_Ambulance_Proposal_IMS568.docx');
  } catch(e) {
    console.log('Note: Al-Farhain_Ambulance_Proposal_IMS568.docx is currently open in Word (' + e.code + '). Updated file saved as Al-Farhain_Ambulance_Proposal_IMS568_Updated.docx.');
  }
}

buildProposalDocument().catch(err => {
  console.error('Error generating document:', err);
  process.exit(1);
});

