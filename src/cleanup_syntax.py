
import os

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def cleanup():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    new_lines = []
    
    for line in lines:
        stripped = line.strip()
        # Remove hanging "Question Body" caused by broken comment
        if stripped == "Question Body":
            continue
            
        # Remove hanging "Row: Text +" if it exists (though previous fix should have caught it)
        if stripped == "Row: Text +":
            continue
            
        new_lines.append(line)
        
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Cleanup complete.")

if __name__ == "__main__":
    cleanup()
