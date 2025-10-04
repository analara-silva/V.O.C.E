import pickle
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, ConfusionMatrixDisplay

# ============================
# 1. Carregar dataset
# ============================
df = pd.read_csv("classifier-tf/dataset.csv")

url_col = "url"
cat_col = "label"

texts = df[url_col].astype(str).tolist()
labels = df[cat_col].astype(str).str.strip().str.lower().tolist()

# ============================
# 2. Vetorização (TF-IDF)
# ============================
vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1,2))
X = vectorizer.fit_transform(texts)

# ============================
# 3. LabelEncoder
# ============================
label_encoder = LabelEncoder()
y = label_encoder.fit_transform(labels)

# Salvar artefatos
with open("classifier-tf/vectorizer.pkl", "wb") as f:
    pickle.dump(vectorizer, f)

with open("classifier-tf/labels.pkl", "wb") as f:
    pickle.dump(label_encoder, f)

# ============================
# 4. Split treino/teste
# ============================
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ============================
# 5. Treinar modelo (Naive Bayes)
# ============================
model = MultinomialNB()
model.fit(X_train, y_train)

# Salvar modelo
with open("classifier-tf/model.pkl", "wb") as f:
    pickle.dump(model, f)

# ============================
# 6. Avaliar desempenho
# ============================
y_pred = model.predict(X_test)

acc = accuracy_score(y_test, y_pred)
print(f"\n📊 Acurácia no conjunto de teste: {acc:.4f}\n")

print("📌 Classification Report:")
print(classification_report(
    y_test,
    y_pred,
    labels=range(len(label_encoder.classes_)),
    target_names=label_encoder.classes_
))

# Matriz de confusão
cm = confusion_matrix(y_test, y_pred, labels=range(len(label_encoder.classes_)))
disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=label_encoder.classes_)

fig, ax = plt.subplots(figsize=(12, 8))
disp.plot(cmap="Blues", xticks_rotation=45, ax=ax, values_format="d")
plt.title("Matriz de Confusão - Naive Bayes (TF-IDF)")
plt.tight_layout()
plt.show()