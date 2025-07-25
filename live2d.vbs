' Hidden version - no console window
Set objShell = CreateObject("WScript.Shell")
objShell.Run "cmd /c chcp 65001 > nul", 0, True
objShell.Run "cmd /c set PYTHONIOENCODING=utf-8 && set PYTHONLEGACYWINDOWSSTDIO=1 && npm start", 0, True