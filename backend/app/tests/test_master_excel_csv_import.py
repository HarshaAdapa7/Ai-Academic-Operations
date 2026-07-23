import pytest
import openpyxl
import io
from fastapi.testclient import TestClient
from app.main import app

def test_master_excel_import_and_reset():
    client = TestClient(app)
    
    # 1. Create a sample Excel workbook with Faculty, Subjects, Classrooms, SectionConfigs
    wb = openpyxl.Workbook()
    
    # Sheet 1: MasterData
    ws = wb.active
    ws.title = "MasterData"
    ws.append([
        "Department", "AcademicYear", "SectionName", "SubjectCode", "SubjectName", 
        "SubjectType", "FacultyEmail", "FacultyName", "Designation", "IsClassTeacher", 
        "MentorEmails", "RoomNumber", "Capacity", "RoomType"
    ])
    ws.append([
        "CSD", 3, "CSD 3-A", "23CD4120", "DATA ENGINEERING", 
        "THEORY", "svs.santhi@anits.edu.in", "Dr. S.V.S. Santhi", "Professor", "FALSE", 
        "svs.santhi@anits.edu.in, bheemshankar@anits.edu.in, arunajyothi@anits.edu.in", "I-506", 60, "CLASSROOM"
    ])
    ws.append([
        "CSD", 3, "CSD 3-A", "23CD4121", "DATA ANALYTICS & VISUALIZATION", 
        "THEORY", "bheemshankar@anits.edu.in", "Dr. Y Bheem Shankar", "Associate Professor", "TRUE", 
        "svs.santhi@anits.edu.in, bheemshankar@anits.edu.in, arunajyothi@anits.edu.in", "I-506", 60, "CLASSROOM"
    ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    # 2. Test Excel Upload
    files = {"file": ("master_test.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    res = client.post("/api/v1/import/master-data", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["records_processed"] >= 2

    # 3. Test Semester Reset
    reset_res = client.delete("/api/v1/faculty/clear-semester-data?keep_faculty=true")
    assert reset_res.status_code == 200
    assert "reset completed" in reset_res.json()["message"].lower()
