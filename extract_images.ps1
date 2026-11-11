Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path "Al-Farhain Ambulance Proposal.docx"))
New-Item -ItemType Directory -Force -Path "extracted_images" | Out-Null
foreach ($entry in $zip.Entries) {
    if ($entry.FullName -like "*media*") {
        $fileName = [System.IO.Path]::GetFileName($entry.FullName)
        if ($fileName) {
            $dest = Join-Path (Resolve-Path "extracted_images") $fileName
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
            Write-Output "Extracted: $fileName"
        }
    }
}
$zip.Dispose()

