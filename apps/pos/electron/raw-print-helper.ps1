# Sends a raw byte buffer to a Windows print queue as a RAW-datatype job,
# via winspool.drv's WritePrinter — bypassing the printer driver's own
# rendering entirely. This is what lets ESC/POS command bytes reach a
# thermal receipt printer's firmware unmodified regardless of which driver
# (often a bare "Generic / Text Only" driver) is bound to the queue.
#
# Usage: powershell -ExecutionPolicy Bypass -File raw-print-helper.ps1 -PrinterName "<name>" -DataFile "<path>"
# Prints "OK:<bytesWritten>" on success, or an error description, to stdout.
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$DataFile
)

$source = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    public static string SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            return "OpenPrinter failed: " + Marshal.GetLastWin32Error();

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "BloomPOS Receipt";
        di.pDataType = "RAW";

        try
        {
            if (!StartDocPrinter(hPrinter, 1, di))
                return "StartDocPrinter failed: " + Marshal.GetLastWin32Error();
            if (!StartPagePrinter(hPrinter))
                return "StartPagePrinter failed: " + Marshal.GetLastWin32Error();

            int written;
            if (!WritePrinter(hPrinter, bytes, bytes.Length, out written))
                return "WritePrinter failed: " + Marshal.GetLastWin32Error();

            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            return "OK:" + written;
        }
        finally
        {
            ClosePrinter(hPrinter);
        }
    }
}
"@

Add-Type -TypeDefinition $source -ErrorAction Stop
$bytes = [System.IO.File]::ReadAllBytes($DataFile)
$result = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)
Write-Output $result
