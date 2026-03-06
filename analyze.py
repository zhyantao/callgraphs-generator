#!/usr/bin/env python3
"""
C/C++ 代码调用关系分析器
使用正则表达式和代码解析生成调用关系图
"""

import json
import re
import os
import sys
from typing import Dict, List, Set

def analyze_code(files: List[Dict[str, str]]) -> Dict:
    """分析代码生成调用关系"""
    
    nodes = []
    edges = []
    
    # 已知库函数
    lib_funcs = {
        'printf', 'scanf', 'sprintf', 'sscanf', 'fprintf', 'fscanf',
        'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memmove',
        'memset', 'memcmp', 'memchr', 'strlen', 'strcpy', 'strncpy',
        'strcat', 'strncat', 'strcmp', 'strncmp', 'strchr', 'strrchr',
        'strstr', 'fopen', 'fclose', 'fread', 'fwrite', 'fgets', 'fputs',
        'exit', 'abort', 'system', 'getenv', 'time', 'clock', 'assert',
        'pthread_create', 'pthread_mutex_lock', 'pthread_mutex_unlock',
    }
    
    # 关键字
    keywords = {
        'if', 'while', 'for', 'switch', 'return', 'sizeof', 'new', 'delete',
        'throw', 'try', 'catch', 'typedef', 'using', 'namespace', 'struct',
        'class', 'enum', 'union', 'static', 'const', 'extern', 'inline',
    }
    
    # 收集所有文件中的函数定义
    all_functions = {}  # func_name -> {id, name, file, line}
    
    for f in files:
        file_name = f['name']
        content = f['content']
        lines = content.split('\n')
        
        # 函数定义正则
        func_def_patterns = [
            # 返回类型 函数名(参数)
            r'^\s*(?:static\s+|inline\s+|virtual\s+|extern\s+|constexpr\s+)*\s*(?:void|int|char|float|double|bool|long|short|unsigned|signed)\s*\*?\s*(\w+)\s*\([^)]*\)\s*(?:const)?\s*\{',
            # 构造函数
            r'^\s*(\w+)\s*\([^)]*\)\s*\{',
            # 带命名空间/类的方法
            r'^\s*(?:\w+::)*(\w+)\s*\([^)]*\)\s*\{',
        ]
        
        in_function = False
        current_func = None
        brace_count = 0
        
        for i, line in enumerate(lines, 1):
            # 跳过注释和字符串
            if re.match(r'^\s*//', line) or re.match(r'^\s*/\*', line):
                continue
            
            matched = False
            for pattern in func_def_patterns:
                match = re.match(pattern, line)
                if match:
                    func_name = match.group(1)
                    # 排除关键字和库函数
                    if func_name not in keywords and func_name not in lib_funcs:
                        func_key = f"{file_name}:{func_name}"
                        if func_key not in all_functions:
                            all_functions[func_key] = {
                                'id': func_key,
                                'name': func_name,
                                'file': file_name,
                                'line': i
                            }
                        current_func = func_name
                        brace_count = 0
                        matched = True
                    break
            
            if current_func:
                # 统计大括号
                brace_count += line.count('{') - line.count('}')
                
                # 函数调用正则
                call_pattern = r'\b(\w+)\s*\('
                for match in re.finditer(call_pattern, line):
                    called_func = match.group(1)
                    # 排除关键字、库函数和自身调用
                    if (called_func not in keywords and 
                        called_func not in lib_funcs and 
                        called_func != current_func):
                        
                        # 在所有函数中查找被调用者
                        for func_key, func_info in all_functions.items():
                            if func_info['name'] == called_func:
                                # 排除自身
                                if f"{file_name}:{current_func}" != func_key:
                                    edge = {
                                        'caller': f"{file_name}:{current_func}",
                                        'callee': func_key,
                                        'line': i
                                    }
                                    # 检查是否已存在
                                    if edge not in edges:
                                        edges.append(edge)
                
                # 检查是否退出函数
                if brace_count <= 0 and '}' in line:
                    current_func = None
    
    # 转换为节点列表
    nodes = list(all_functions.values())
    
    # 跨文件调用分析 - 第二轮
    for f in files:
        file_name = f['name']
        content = f['content']
        lines = content.split('\n')
        
        in_function = False
        current_func = None
        brace_count = 0
        
        for i, line in enumerate(lines, 1):
            matched = False
            for pattern in func_def_patterns:
                match = re.match(pattern, line)
                if match:
                    func_name = match.group(1)
                    if func_name not in keywords and func_name not in lib_funcs:
                        current_func = func_name
                        brace_count = 0
                        matched = True
                    break
            
            if current_func:
                brace_count += line.count('{') - line.count('}')
                
                # 查找跨文件调用
                call_pattern = r'\b(\w+)\s*\('
                for match in re.finditer(call_pattern, line):
                    called_func = match.group(1)
                    if (called_func not in keywords and 
                        called_func not in lib_funcs and 
                        called_func != current_func):
                        
                        # 在其他文件中查找
                        for func_key, func_info in all_functions.items():
                            if (func_info['name'] == called_func and 
                                func_info['file'] != file_name):
                                
                                edge = {
                                    'caller': f"{file_name}:{current_func}",
                                    'callee': func_key,
                                    'line': i
                                }
                                if edge not in edges:
                                    edges.append(edge)
                
                if brace_count <= 0 and '}' in line:
                    current_func = None
    
    return {
        'nodes': nodes,
        'edges': edges
    }


if __name__ == '__main__':
    try:
        input_data = json.load(sys.stdin)
        files = input_data.get('files', [])
        
        result = analyze_code(files)
        print(json.dumps({
            'success': True,
            'data': result
        }))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))
