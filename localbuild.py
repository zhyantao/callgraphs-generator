import os
import sys

htmldir = sys.argv[1]
html_list = []


def collect_html(path):
    for item in os.listdir(path):
        new_path = path + "/" + item
        if os.path.isdir(new_path):
            collect_html(new_path)
        else:
            _, ext = os.path.splitext(new_path)
            if ext == ".html":
                html_list.append(new_path)


print("htmldir: ", htmldir)
collect_html(htmldir)

for html_file in html_list:
    html_content = ""
    with open(html_file, "r", encoding="UTF-8") as f:
        html_content_lines = f.readlines()
        for line in html_content_lines:
            html_content += line
    if html_content.find("/callgraphs-generator") != -1:
        print("Processing: " + html_file)
        html_content = html_content.replace("/callgraphs-generator", "")
        with open(html_file, "w", encoding="UTF-8") as f:
            f.write(html_content)