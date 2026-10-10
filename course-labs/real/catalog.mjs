export const chapters={
'004':{title:'三维重建 Ⅰ',scenes:[{id:'03',title:'实拍照片单目深度',goal:'运行 Depth Anything V2 Small，观察真实照片的相对深度。',pages:'47–66',task:'检查镜面、玻璃和遮挡边缘的预测失误；未标定深度不表示米制距离。'}]},
'005':{title:'三维重建 Ⅱ',scenes:[{id:'02',title:'实拍双目匹配与视差',goal:'使用 Aloe 左右照片，检查匹配代价、视差与置信度。',pages:'25–42',task:'选择纹理、纯色和遮挡区域，比较窗口与最大视差。'},{id:'03',title:'真实帧 Lucas–Kanade 光流',goal:'调用 JSFeat，在篮球帧对上计算特征与金字塔光流。',pages:'44–63',task:'改变窗口与金字塔层数，检查跟踪失败点。'}]},
'006':{title:'视觉感知',scenes:[{id:'01',title:'实拍帧差与变化检测',goal:'比较实拍篮球帧的 RGB 差值与阈值掩码。',pages:'3–22',task:'改变阈值观察噪声与漏检，变化掩码不表示目标身份。'},{id:'02',title:'真实帧特征跟踪',goal:'跟踪篮球帧角点，查看金字塔与成功标志。',pages:'3–22',task:'检查遮挡附近的跟踪失效，区分光流和物体身份。'},{id:'04',title:'真实照片 RGB 图像分割',goal:'对 NASA 实拍照片执行颜色聚类，观察每轮误差。',pages:'23–40',task:'比较两个簇与五个簇；颜色簇不等于语义类别。'}]},
'007':{title:'机器学习',scenes:[{id:'03',title:'真实照片分类与特征训练',goal:'用 MobileNet 提取1024维特征，训练逻辑回归并与 KNN 对照。',pages:'37–53、86–104',task:'标注不同照片为 A/B，再用独立照片测试，区分拟合与泛化。'}]},
'008':{title:'深度学习',scenes:[{id:'01',title:'真实预训练特征迁移',goal:'使用冻结的 MobileNet 特征训练照片分类头。',pages:'3–20',task:'比较 ImageNet 类别和自己的标签，只有分类头更新。'},{id:'02',title:'真实照片目标检测',goal:'调用 COCO-SSD，检查分数阈值与二次 NMS。',pages:'22–39',task:'观察误检与漏检，没有真实标注时不报告准确率。'}]}
};
export function resolveScene(chapter,id){const list=chapters[chapter]?.scenes;if(!list)throw Error('章节路径不正确');return list.find(s=>s.id===id)??list[0];}
