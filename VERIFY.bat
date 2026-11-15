@echo off
call "%~dp0SIGHTLINE.bat" verify %*
exit /b %errorlevel%
