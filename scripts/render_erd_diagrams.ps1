Add-Type -AssemblyName System.Drawing

function Create-CoreERD {
    param([string]$outputPath)
    
    $width = 1600
    $height = 1000
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::White)
    
    $headerFont = New-Object System.Drawing.Font("Arial", 14, [System.Drawing.FontStyle]::Bold)
    $titleFont = New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Bold)
    $fieldFont = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Regular)
    $relFont = New-Object System.Drawing.Font("Arial", 9, [System.Drawing.FontStyle]::Italic)
    
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(44, 62, 80), 2)
    $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(52, 73, 94), 2)
    $headerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(128, 0, 0)) # Maroon
    $headerTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $bodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 249, 250))
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(33, 37, 41))
    $relBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 110, 120))
    
    # Title
    $g.DrawString("Figure 5: AFAMS Core Entity Relationships (Master & Booking Core)", $headerFont, $headerBrush, 30, 25)
    
    # Helper to draw table entity
    function Draw-Entity($title, $x, $y, $w, $fields) {
        $headerH = 32
        $rowH = 22
        $totalH = $headerH + ($fields.Count * $rowH) + 8
        
        # Body
        $g.FillRectangle($bodyBrush, $x, $y, $w, $totalH)
        $g.DrawRectangle($borderPen, $x, $y, $w, $totalH)
        
        # Header
        $g.FillRectangle($headerBrush, $x, $y, $w, $headerH)
        $g.DrawRectangle($borderPen, $x, $y, $w, $headerH)
        $g.DrawString($title, $titleFont, $headerTextBrush, ($x + 10), ($y + 6))
        
        # Fields
        $curY = $y + $headerH + 6
        foreach ($f in $fields) {
            $g.DrawString($f, $fieldFont, $textBrush, ($x + 10), $curY)
            $curY += $rowH
        }
        return @{ X = $x; Y = $y; W = $w; H = $totalH; CenterX = ($x + $w / 2); CenterY = ($y + $totalH / 2) }
    }
    
    # Entities
    $branches = Draw-Entity "branches" 60 90 260 @(
        "+ branch_id: UUID [PK]",
        "  branch_code: TEXT [UQ]",
        "  name: TEXT",
        "  address: TEXT",
        "  contact_phone: TEXT",
        "  is_active: BOOLEAN",
        "  created_at: TIMESTAMPTZ"
    )
    
    $staff = Draw-Entity "staff_profiles" 420 90 270 @(
        "+ user_id: UUID [PK, FK]",
        "* branch_id: UUID [FK]",
        "  display_name: TEXT",
        "  role: TEXT (hq_admin/driver)",
        "  contact_phone: TEXT",
        "  duty_status: TEXT",
        "  is_active: BOOLEAN"
    )
    
    $vehicles = Draw-Entity "vehicles" 780 90 270 @(
        "+ vehicle_id: UUID [PK]",
        "* branch_id: UUID [FK]",
        "  registration_no: TEXT [UQ]",
        "  model: TEXT",
        "  readiness_status: TEXT",
        "  is_active: BOOLEAN"
    )
    
    $tariffs = Draw-Entity "tariff_versions" 1140 90 280 @(
        "+ tariff_id: UUID [PK]",
        "  version_code: TEXT [UQ]",
        "  base_fare: NUMERIC(10,2)",
        "  included_km: NUMERIC(8,2)",
        "  extra_rate: NUMERIC(10,2)",
        "  distance_policy: TEXT",
        "  escort_rates: JSONB"
    )
    
    $bookings = Draw-Entity "bookings" 60 480 320 @(
        "+ booking_id: UUID [PK]",
        "  booking_ref: TEXT [UQ]",
        "* branch_id: UUID [FK]",
        "* tariff_id: UUID [FK]",
        "  caller_name: TEXT",
        "  caller_phone: TEXT",
        "  distance_km: NUMERIC(8,2)",
        "  transport_fare: NUMERIC(10,2)",
        "  equipment_amount: NUMERIC(10,2)",
        "  total_amount: NUMERIC(10,2)",
        "  status: TEXT",
        "  created_at: TIMESTAMPTZ"
    )
    
    $stops = Draw-Entity "booking_stops" 480 480 270 @(
        "+ stop_id: UUID [PK]",
        "* booking_id: UUID [FK]",
        "  sequence_no: SMALLINT",
        "  stop_type: TEXT",
        "  label: TEXT",
        "  latitude: NUMERIC(9,6)",
        "  longitude: NUMERIC(9,6)"
    )
    
    $assignments = Draw-Entity "trip_assignments" 850 480 310 @(
        "+ assignment_id: UUID [PK]",
        "* booking_id: UUID [FK]",
        "* vehicle_id: UUID [FK]",
        "* driver_id: UUID [FK]",
        "* assigned_by: UUID [FK]",
        "  state: TEXT (offered/accepted)",
        "  assigned_at: TIMESTAMPTZ",
        "  accepted_at: TIMESTAMPTZ",
        "  released_at: TIMESTAMPTZ"
    )
    
    # Draw Relationship Lines
    # branches -> staff (1:N)
    $g.DrawLine($linePen, ($branches.X + $branches.W), ($branches.Y + 50), $staff.X, ($staff.Y + 50))
    $g.DrawString("1:N", $relFont, $relBrush, ($branches.X + $branches.W + 20), ($branches.Y + 35))
    
    # branches -> vehicles (1:N)
    $g.DrawLine($linePen, ($staff.X + $staff.W), ($staff.Y + 50), $vehicles.X, ($vehicles.Y + 50))
    $g.DrawString("1:N (via branch)", $relFont, $relBrush, ($staff.X + $staff.W + 15), ($staff.Y + 35))
    
    # branches -> bookings (1:N)
    $g.DrawLine($linePen, ($branches.X + 80), ($branches.Y + $branches.H), ($bookings.X + 80), $bookings.Y)
    $g.DrawString("1:N", $relFont, $relBrush, ($branches.X + 85), ($branches.Y + $branches.H + 40))
    
    # tariffs -> bookings (1:N)
    $g.DrawBezier($linePen, 
        [System.Drawing.PointF]::new(($tariffs.X + 60), ($tariffs.Y + $tariffs.H)),
        [System.Drawing.PointF]::new(($tariffs.X + 60), ($tariffs.Y + $tariffs.H + 100)),
        [System.Drawing.PointF]::new(($bookings.X + $bookings.W + 60), ($bookings.Y - 80)),
        [System.Drawing.PointF]::new(($bookings.X + $bookings.W), ($bookings.Y + 60))
    )
    $g.DrawString("1:N (pricing rules)", $relFont, $relBrush, ($bookings.X + $bookings.W + 10), ($bookings.Y + 35))
    
    # bookings -> booking_stops (1:N)
    $g.DrawLine($linePen, ($bookings.X + $bookings.W), ($bookings.Y + 80), $stops.X, ($stops.Y + 80))
    $g.DrawString("1:N (ordered stops)", $relFont, $relBrush, ($bookings.X + $bookings.W + 15), ($bookings.Y + 65))
    
    # bookings -> trip_assignments (1:N history, 1:1 active)
    $g.DrawLine($linePen, ($stops.X + $stops.W), ($stops.Y + 80), $assignments.X, ($assignments.Y + 80))
    $g.DrawString("1:N (assignment log)", $relFont, $relBrush, ($stops.X + $stops.W + 15), ($stops.Y + 65))
    
    # vehicles -> assignments (1:N history, 1 active)
    $g.DrawLine($linePen, ($vehicles.X + 80), ($vehicles.Y + $vehicles.H), ($assignments.X + 80), $assignments.Y)
    $g.DrawString("1:N", $relFont, $relBrush, ($vehicles.X + 85), ($vehicles.Y + $vehicles.H + 40))
    
    # staff (driver) -> assignments (1:N history, 1 active)
    $g.DrawBezier($linePen,
        [System.Drawing.PointF]::new(($staff.X + 150), ($staff.Y + $staff.H)),
        [System.Drawing.PointF]::new(($staff.X + 150), ($staff.Y + $staff.H + 120)),
        [System.Drawing.PointF]::new(($assignments.X + 220), ($assignments.Y - 100)),
        [System.Drawing.PointF]::new(($assignments.X + 220), $assignments.Y)
    )
    $g.DrawString("1:N (driver allocation)", $relFont, $relBrush, ($assignments.X + 170), ($assignments.Y - 50))
    
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Core ERD created at: $outputPath"
}

function Create-TripERD {
    param([string]$outputPath)
    
    $width = 1600
    $height = 1000
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::White)
    
    $headerFont = New-Object System.Drawing.Font("Arial", 14, [System.Drawing.FontStyle]::Bold)
    $titleFont = New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Bold)
    $fieldFont = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Regular)
    $relFont = New-Object System.Drawing.Font("Arial", 9, [System.Drawing.FontStyle]::Italic)
    
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(44, 62, 80), 2)
    $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(52, 73, 94), 2)
    $headerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(128, 0, 0)) # Maroon
    $headerTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $bodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 249, 250))
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(33, 37, 41))
    $relBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 110, 120))
    
    # Title
    $g.DrawString("Figure 6: AFAMS Trip Execution, Equipment & Transaction Entity Relationships", $headerFont, $headerBrush, 30, 25)
    
    function Draw-Entity($title, $x, $y, $w, $fields) {
        $headerH = 32
        $rowH = 22
        $totalH = $headerH + ($fields.Count * $rowH) + 8
        $g.FillRectangle($bodyBrush, $x, $y, $w, $totalH)
        $g.DrawRectangle($borderPen, $x, $y, $w, $totalH)
        $g.FillRectangle($headerBrush, $x, $y, $w, $headerH)
        $g.DrawRectangle($borderPen, $x, $y, $w, $headerH)
        $g.DrawString($title, $titleFont, $headerTextBrush, ($x + 10), ($y + 6))
        $curY = $y + $headerH + 6
        foreach ($f in $fields) {
            $g.DrawString($f, $fieldFont, $textBrush, ($x + 10), $curY)
            $curY += $rowH
        }
        return @{ X = $x; Y = $y; W = $w; H = $totalH }
    }
    
    # Central Booking Entity
    $bookings = Draw-Entity "bookings" 600 320 300 @(
        "+ booking_id: UUID [PK]",
        "  booking_ref: TEXT [UQ]",
        "  status: TEXT",
        "  distance_km: NUMERIC",
        "  total_amount: NUMERIC",
        "  caller_name: TEXT",
        "  patient_reference: TEXT"
    )
    
    # Top entities: Checklists & Events
    $checklists = Draw-Entity "trip_checklists" 120 70 300 @(
        "+ checklist_id: UUID [PK]",
        "* booking_id: UUID [FK]",
        "  phase: TEXT (pre/post_trip)",
        "  vehicle_checked: BOOLEAN",
        "  stretcher_checked: BOOLEAN",
        "  equipment_checked: BOOLEAN",
        "  odometer_reading: NUMERIC",
        "  checked_at: TIMESTAMPTZ"
    )
    
    $events = Draw-Entity "trip_events" 500 70 310 @(
        "+ event_id: UUID [PK]",
        "  client_event_id: UUID [UQ]",
        "* booking_id: UUID [FK]",
        "* actor_id: UUID [FK]",
        "  event_type: TEXT",
        "  occurred_at: TIMESTAMPTZ",
        "  latitude: NUMERIC",
        "  longitude: NUMERIC"
    )
    
    $closures = Draw-Entity "trip_closures" 900 70 310 @(
        "+* booking_id: UUID [PK, FK]",
        "  odometer_start: NUMERIC",
        "  odometer_end: NUMERIC",
        "  recorded_km: NUMERIC [GEN]",
        "  handover_unit: TEXT",
        "  handover_at: TIMESTAMPTZ",
        "  completed_at: TIMESTAMPTZ"
    )
    
    # Bottom entities: Equipment & Financials
    $equipmentCat = Draw-Entity "equipment_catalogue" 100 620 280 @(
        "+ equipment_id: UUID [PK]",
        "  item_code: TEXT [UQ]",
        "  name: TEXT",
        "  category: TEXT",
        "  billing_unit: TEXT",
        "  unit_price: NUMERIC",
        "  is_available: BOOLEAN"
    )
    
    $bookingEquip = Draw-Entity "booking_equipment" 480 620 280 @(
        "+* booking_id: UUID [PK, FK]",
        "+* equipment_id: UUID [PK, FK]",
        "  quantity: INTEGER",
        "  unit_price: NUMERIC",
        "  line_amount: NUMERIC [GEN]"
    )
    
    $invoices = Draw-Entity "invoices" 860 620 290 @(
        "+ invoice_id: UUID [PK]",
        "  invoice_number: TEXT [UQ]",
        "* booking_id: UUID [FK]",
        "  version_no: INTEGER",
        "  total_amount: NUMERIC",
        "  state: TEXT (draft/issued)",
        "  issued_at: TIMESTAMPTZ"
    )
    
    $audit = Draw-Entity "audit_events" 1220 480 290 @(
        "+ audit_id: UUID [PK]",
        "* actor_id: UUID [FK]",
        "  entity_type: TEXT",
        "  entity_id: UUID",
        "  action: TEXT",
        "  change_summary: JSONB",
        "  created_at: TIMESTAMPTZ"
    )
    
    # Connecting Lines
    # bookings -> checklists (1:N)
    $g.DrawLine($linePen, ($bookings.X + 50), $bookings.Y, ($checklists.X + 150), ($checklists.Y + $checklists.H))
    $g.DrawString("1:N (readiness logs)", $relFont, $relBrush, ($checklists.X + 160), ($checklists.Y + $checklists.H + 40))
    
    # bookings -> events (1:N)
    $g.DrawLine($linePen, ($bookings.X + 150), $bookings.Y, ($events.X + 150), ($events.Y + $events.H))
    $g.DrawString("1:N (status lifecycle)", $relFont, $relBrush, ($events.X + 160), ($events.Y + $events.H + 40))
    
    # bookings -> closures (1:1)
    $g.DrawLine($linePen, ($bookings.X + 250), $bookings.Y, ($closures.X + 150), ($closures.Y + $closures.H))
    $g.DrawString("1:1 (trip handover closure)", $relFont, $relBrush, ($closures.X + 30), ($closures.Y + $closures.H + 40))
    
    # bookings -> booking_equipment (1:N)
    $g.DrawLine($linePen, ($bookings.X + 80), ($bookings.Y + $bookings.H), ($bookingEquip.X + 80), $bookingEquip.Y)
    $g.DrawString("1:N", $relFont, $relBrush, ($bookingEquip.X + 90), ($bookingEquip.Y - 30))
    
    # equipmentCat -> bookingEquip (1:N)
    $g.DrawLine($linePen, ($equipmentCat.X + $equipmentCat.W), ($equipmentCat.Y + 50), $bookingEquip.X, ($bookingEquip.Y + 50))
    $g.DrawString("1:N (M:N resolved)", $relFont, $relBrush, ($equipmentCat.X + $equipmentCat.W + 10), ($equipmentCat.Y + 30))
    
    # bookings -> invoices (1:N versions)
    $g.DrawLine($linePen, ($bookings.X + 220), ($bookings.Y + $bookings.H), ($invoices.X + 100), $invoices.Y)
    $g.DrawString("1:N (versioned invoices)", $relFont, $relBrush, ($invoices.X + 110), ($invoices.Y - 30))
    
    # bookings -> audit_events (1:N)
    $g.DrawLine($linePen, ($bookings.X + $bookings.W), ($bookings.Y + 80), $audit.X, ($audit.Y + 80))
    $g.DrawString("1:N (audit trail)", $relFont, $relBrush, ($bookings.X + $bookings.W + 15), ($bookings.Y + 65))
    
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Trip ERD created at: $outputPath"
}

Create-CoreERD "scripts/figure5_core_erd.png"
Create-TripERD "scripts/figure6_trip_erd.png"

