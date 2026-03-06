import { NextRequest, NextResponse } from 'next/server';

// LLM 智能分析接口

interface LLMRequest {
  functionName: string;
  callGraph: {
    nodes: Array<{ id: string; name: string; file: string }>;
    edges: Array<{ caller: string; callee: string }>;
  };
}

interface FunctionInfo {
  id: string;
  name: string;
  file: string;
}

function getFunctionInfo(id: string, nodes: FunctionInfo[]): FunctionInfo | undefined {
  return nodes.find(n => n.id === id);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as LLMRequest;
    const { functionName, callGraph } = body;
    
    if (!functionName || !callGraph) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // 找到函数节点
    const node = callGraph.nodes.find(n => n.name === functionName);
    
    // 找到调用该函数的父函数（调用者）
    const incomingEdges = callGraph.edges.filter(e => e.callee.includes(functionName) || e.callee === functionName);
    const callers = incomingEdges.map(e => {
      const callerNode = getFunctionInfo(e.caller, callGraph.nodes);
      return callerNode?.name || e.caller;
    });
    
    // 找到该函数调用的子函数（被调用者）
    const outgoingEdges = callGraph.edges.filter(e => e.caller.includes(functionName) || e.caller === functionName);
    const callees = outgoingEdges.map(e => {
      const calleeNode = getFunctionInfo(e.callee, callGraph.nodes);
      return calleeNode?.name || e.callee;
    });
    
    // 去重
    const uniqueCallers = [...new Set(callers)];
    const uniqueCallees = [...new Set(callees)];
    
    // 分析函数类型和可能的功能
    let functionType = '普通函数';
    let possiblePurpose = '';
    
    // 基于调用关系进行推断
    if (functionName.toLowerCase().includes('init') || functionName.toLowerCase().includes('setup')) {
      functionType = '初始化函数';
      possiblePurpose = '负责程序或模块的初始化工作，设置初始状态和配置';
    } else if (functionName.toLowerCase().includes('cleanup') || functionName.toLowerCase().includes('destroy') || functionName.toLowerCase().includes('release')) {
      functionType = '清理/销毁函数';
      possiblePurpose = '负责释放资源、清理数据，执行清理工作';
    } else if (functionName.toLowerCase().includes('main')) {
      functionType = '主函数/入口点';
      possiblePurpose = '程序的主入口点，协调各模块运行';
    } else if (functionName.toLowerCase().includes('callback') || functionName.toLowerCase().includes('handler')) {
      functionType = '回调/处理函数';
      possiblePurpose = '响应特定事件或条件的处理逻辑';
    } else if (uniqueCallees.length > 3) {
      functionType = '控制/协调函数';
      possiblePurpose = '协调多个子函数的调用，管理复杂逻辑';
    } else if (uniqueCallers.length > 2) {
      functionType = '核心功能函数';
      possiblePurpose = '提供关键功能，被多个模块调用';
    } else if (uniqueCallees.length > 0) {
      functionType = '功能函数';
      possiblePurpose = '执行特定功能，可能调用其他辅助函数';
    } else {
      functionType = '叶子函数';
      possiblePurpose = '执行基础操作或计算';
    }
    
    // 构建分析结果
    const analysisResult = {
      functionName,
      file: node?.file || 'unknown',
      functionType,
      
      // 函数功能分析
      purpose: {
        description: possiblePurpose,
        details: uniqueCallees.length > 0 
          ? `该函数调用了 ${uniqueCallees.length} 个子函数: ${uniqueCallees.join(', ')}`
          : '该函数不调用其他自定义函数'
      },
      
      // 调用关系摘要
      callGraph: {
        callers: uniqueCallers,
        callees: uniqueCallees,
        totalCallers: uniqueCallers.length,
        totalCallees: uniqueCallees.length
      }
    };
    
    return NextResponse.json({
      success: true,
      data: analysisResult,
    });
  } catch (error) {
    console.error('LLM analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 }
    );
  }
}
