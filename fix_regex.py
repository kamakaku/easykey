#!/usr/bin/env python3

# Read the file
with open('/Users/kamakaku/_easykey/_anwendung/apps/web/app/generator/GeneratorClient.tsx', 'r') as file:
    content = file.read()

# The problematic line to replace
old_line = "        basePassword = basePassword.replace(/[\\s,\\-\\/]/g, ''); // Punkt bleibt"
new_line = "        basePassword = basePassword.replace(/[\\s,\\/\\-]/g, ''); // Punkt bleibt"

# Replace the specific line
content = content.replace(old_line, new_line)

# Write the file back
with open('/Users/kamakaku/_easykey/_anwendung/apps/web/app/generator/GeneratorClient.tsx', 'w') as file:
    file.write(content)

print("Replacement completed!")