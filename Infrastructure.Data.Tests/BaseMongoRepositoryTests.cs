using Domain;
using Infrastructure.Data;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace Infrastructure.Data.Tests
{

    public class BaseMongoRepositoryTests
    {
        private readonly Mock<IMongoDatabase> _mockDatabase;
        private readonly Mock<IMongoCollection<TestEntity>> _mockCollection;
        private readonly TestMongoRepository _repository;

        public BaseMongoRepositoryTests()
        {
            _mockDatabase = new Mock<IMongoDatabase>();
            _mockCollection = new Mock<IMongoCollection<TestEntity>>();

            _mockDatabase.Setup(x => x.GetCollection<TestEntity>(It.IsAny<string>(), null))
                .Returns(_mockCollection.Object);

            _repository = new TestMongoRepository(_mockDatabase.Object);
        }

        [Fact]
        public async Task GetByIdAsync_ShouldReturnEntity_WhenEntityExists()
        {
            // Arrange
            var testId = Guid.NewGuid();
            var expectedEntity = new TestEntity
            {
                Id = testId,
                Name = "Test Entity",
                DateCreated = DateTimeOffset.UtcNow,
                DateUpdated = DateTimeOffset.UtcNow
            };

            var mockCursor = new Mock<IAsyncCursor<TestEntity>>();
            mockCursor.Setup(x => x.Current).Returns(new List<TestEntity> { expectedEntity });
            mockCursor.SetupSequence(x => x.MoveNext(It.IsAny<CancellationToken>()))
                .Returns(true)
                .Returns(false);
            mockCursor.SetupSequence(x => x.MoveNextAsync(It.IsAny<CancellationToken>()))
                .ReturnsAsync(true)
                .ReturnsAsync(false);

            _mockCollection.Setup(x => x.FindAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<FindOptions<TestEntity, TestEntity>>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(mockCursor.Object);

            // Act
            var result = await _repository.GetByIdAsync(testId);

            // Assert
            Assert.NotNull(result);
            Assert.Equal(testId, result.Id);
            Assert.Equal("Test Entity", result.Name);
        }

        [Fact]
        public async Task GetByIdAsync_ShouldReturnNull_WhenEntityDoesNotExist()
        {
            // Arrange
            var testId = Guid.NewGuid();

            var mockCursor = new Mock<IAsyncCursor<TestEntity>>();
            mockCursor.Setup(x => x.Current).Returns(new List<TestEntity>());
            mockCursor.Setup(x => x.MoveNext(It.IsAny<CancellationToken>())).Returns(false);
            mockCursor.Setup(x => x.MoveNextAsync(It.IsAny<CancellationToken>())).ReturnsAsync(false);

            _mockCollection.Setup(x => x.FindAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<FindOptions<TestEntity, TestEntity>>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(mockCursor.Object);

            // Act
            var result = await _repository.GetByIdAsync(testId);

            // Assert
            Assert.Null(result);
        }

        [Fact]
        public async Task CreateAsync_ShouldSetDateFieldsAndInsertEntity()
        {
            // Arrange
            var entity = new TestEntity
            {
                Id = Guid.NewGuid(),
                Name = "New Entity"
            };

            _mockCollection.Setup(x => x.InsertOneAsync(
                It.IsAny<TestEntity>(),
                It.IsAny<InsertOneOptions>(),
                It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            // Act
            var result = await _repository.CreateAsync(entity);

            // Assert
            Assert.NotNull(result);
            Assert.Equal(entity.Id, result.Id);
            Assert.Equal(entity.Name, result.Name);
            Assert.NotEqual(default(DateTimeOffset), result.DateCreated);
            Assert.NotEqual(default(DateTimeOffset), result.DateUpdated);
            // Check that both dates are set to the same value (within a small tolerance)
            Assert.True(Math.Abs((result.DateCreated - result.DateUpdated).TotalMilliseconds) < 1);

            _mockCollection.Verify(x => x.InsertOneAsync(
                It.Is<TestEntity>(e => e.DateCreated != default && e.DateUpdated != default),
                It.IsAny<InsertOneOptions>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task CreateAsync_ShouldThrowArgumentNullException_WhenEntityIsNull()
        {
            // Act & Assert
            await Assert.ThrowsAsync<ArgumentNullException>(() => _repository.CreateAsync(null!));
        }

        [Fact]
        public async Task InsertManyAsync_ShouldSetDateFieldsForAllEntities()
        {
            // Arrange
            var entities = new List<TestEntity>
            {
                new TestEntity { Id = Guid.NewGuid(), Name = "Entity 1" },
                new TestEntity { Id = Guid.NewGuid(), Name = "Entity 2" },
                new TestEntity { Id = Guid.NewGuid(), Name = "Entity 3" }
            };

            _mockCollection.Setup(x => x.InsertManyAsync(
                It.IsAny<IEnumerable<TestEntity>>(),
                It.IsAny<InsertManyOptions>(),
                It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            // Act
            await _repository.InsertManyAsync(entities);

            // Assert
            _mockCollection.Verify(x => x.InsertManyAsync(
                It.Is<IEnumerable<TestEntity>>(e => e.All(entity =>
                    entity.DateCreated != default &&
                    entity.DateUpdated != default &&
                    entity.DateCreated == entity.DateUpdated)),
                It.IsAny<InsertManyOptions>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task InsertManyAsync_ShouldNotCallDatabase_WhenCollectionIsEmpty()
        {
            // Arrange
            var entities = new List<TestEntity>();

            // Act
            await _repository.InsertManyAsync(entities);

            // Assert
            _mockCollection.Verify(x => x.InsertManyAsync(
                It.IsAny<IEnumerable<TestEntity>>(),
                It.IsAny<InsertManyOptions>(),
                It.IsAny<CancellationToken>()), Times.Never);
        }

        [Fact]
        public async Task UpdateAsync_ShouldUpdateDateUpdatedAndReplaceEntity()
        {
            // Arrange
            var entity = new TestEntity
            {
                Id = Guid.NewGuid(),
                Name = "Updated Entity",
                DateCreated = DateTimeOffset.UtcNow.AddDays(-1),
                DateUpdated = DateTimeOffset.UtcNow.AddDays(-1)
            };

            var replaceResult = new ReplaceOneResult.Acknowledged(1, 1, BsonNull.Value);
            _mockCollection.Setup(x => x.ReplaceOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<TestEntity>(),
                It.IsAny<ReplaceOptions>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(replaceResult);

            var originalDateCreated = entity.DateCreated;

            // Act
            var result = await _repository.UpdateAsync(entity);

            // Assert
            Assert.NotNull(result);
            Assert.Equal(entity.Id, result.Id);
            Assert.Equal(entity.Name, result.Name);
            Assert.Equal(originalDateCreated, result.DateCreated);
            Assert.True(result.DateUpdated > originalDateCreated);

            _mockCollection.Verify(x => x.ReplaceOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.Is<TestEntity>(e => e.DateUpdated > originalDateCreated),
                It.IsAny<ReplaceOptions>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task UpdateAsync_ShouldThrowException_WhenEntityNotFound()
        {
            // Arrange
            var entity = new TestEntity { Id = Guid.NewGuid(), Name = "Non-existent Entity" };

            var replaceResult = new ReplaceOneResult.Acknowledged(0, 0, BsonNull.Value);
            _mockCollection.Setup(x => x.ReplaceOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<TestEntity>(),
                It.IsAny<ReplaceOptions>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(replaceResult);

            // Act & Assert
            var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => _repository.UpdateAsync(entity));
            Assert.Contains(entity.Id.ToString(), exception.Message);
        }

        [Fact]
        public async Task DeleteAsync_ShouldDeleteEntity_WhenEntityExists()
        {
            // Arrange
            var testId = Guid.NewGuid();
            var deleteResult = new DeleteResult.Acknowledged(1);

            _mockCollection.Setup(x => x.DeleteOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(deleteResult);

            // Act
            await _repository.DeleteAsync(testId);

            // Assert
            _mockCollection.Verify(x => x.DeleteOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task DeleteAsync_ShouldThrowException_WhenEntityNotFound()
        {
            // Arrange
            var testId = Guid.NewGuid();
            var deleteResult = new DeleteResult.Acknowledged(0);

            _mockCollection.Setup(x => x.DeleteOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(deleteResult);

            // Act & Assert
            var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => _repository.DeleteAsync(testId));
            Assert.Contains(testId.ToString(), exception.Message);
        }

        [Fact]
        public async Task PatchAsync_ShouldUpdateSpecifiedFieldsAndDateUpdated()
        {
            // Arrange
            var testId = Guid.NewGuid();
            var updates = new { Name = "Patched Name", Value = 42 };

            var updateResult = new UpdateResult.Acknowledged(1, 1, BsonNull.Value);
            _mockCollection.Setup(x => x.UpdateOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<UpdateDefinition<TestEntity>>(),
                It.IsAny<UpdateOptions>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(updateResult);

            // Act
            await _repository.PatchAsync(testId, updates);

            // Assert
            _mockCollection.Verify(x => x.UpdateOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<UpdateDefinition<TestEntity>>(),
                It.IsAny<UpdateOptions>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task PatchAsync_ShouldUpdateOnlySpecifiedProperties_WhenPropertyNamesProvided()
        {
            // Arrange
            var testId = Guid.NewGuid();
            var updates = new { Name = "Patched Name", Value = 42, Description = "New Description" };
            var propertyNames = new[] { "Name", "Value" };

            var updateResult = new UpdateResult.Acknowledged(1, 1, BsonNull.Value);
            _mockCollection.Setup(x => x.UpdateOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<UpdateDefinition<TestEntity>>(),
                It.IsAny<UpdateOptions>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(updateResult);

            // Act
            await _repository.PatchAsync(testId, updates, propertyNames);

            // Assert
            _mockCollection.Verify(x => x.UpdateOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<UpdateDefinition<TestEntity>>(),
                It.IsAny<UpdateOptions>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task PatchAsync_ShouldThrowException_WhenEntityNotFound()
        {
            // Arrange
            var testId = Guid.NewGuid();
            var updates = new { Name = "Patched Name" };

            var updateResult = new UpdateResult.Acknowledged(0, 0, BsonNull.Value);
            _mockCollection.Setup(x => x.UpdateOneAsync(
                It.IsAny<FilterDefinition<TestEntity>>(),
                It.IsAny<UpdateDefinition<TestEntity>>(),
                It.IsAny<UpdateOptions>(),
                It.IsAny<CancellationToken>()))
                .ReturnsAsync(updateResult);

            // Act & Assert
            var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => _repository.PatchAsync(testId, updates));
            Assert.Contains(testId.ToString(), exception.Message);
        }

        [Fact]
        public async Task PatchAsync_ShouldThrowArgumentNullException_WhenUpdatesIsNull()
        {
            // Arrange
            var testId = Guid.NewGuid();

            // Act & Assert
            await Assert.ThrowsAsync<ArgumentNullException>(() => _repository.PatchAsync(testId, null!));
        }

        [Fact]
        public void Constructor_ShouldThrowArgumentNullException_WhenDatabaseIsNull()
        {
            // Act & Assert
            Assert.Throws<ArgumentNullException>(() => new TestMongoRepository(null!));
        }

        [Fact]
        public void Constructor_ShouldCreateCollectionWithCorrectName()
        {
            // Arrange
            var freshMockDatabase = new Mock<IMongoDatabase>();
            var mockCollection = new Mock<IMongoCollection<TestEntity>>();
            
            freshMockDatabase.Setup(x => x.GetCollection<TestEntity>("TestEntity", null))
                .Returns(mockCollection.Object);

            // Act
            var repository = new TestMongoRepository(freshMockDatabase.Object);

            // Assert
            freshMockDatabase.Verify(x => x.GetCollection<TestEntity>("TestEntity", null), Times.Once);
        }

        [Fact]
        public void Constructor_ShouldUseProvidedCollectionName()
        {
            // Arrange
            var freshMockDatabase = new Mock<IMongoDatabase>();
            var mockCollection = new Mock<IMongoCollection<TestEntity>>();
            var customCollectionName = "customTestCollection";
            
            freshMockDatabase.Setup(x => x.GetCollection<TestEntity>(customCollectionName, null))
                .Returns(mockCollection.Object);

            // Act
            var repository = new TestMongoRepository(freshMockDatabase.Object, customCollectionName);

            // Assert
            freshMockDatabase.Verify(x => x.GetCollection<TestEntity>(customCollectionName, null), Times.Once);
        }
    }

    // Test entity for unit tests
    public class TestEntity : BaseDataObject
    {
        public string Name { get; set; } = string.Empty;
        public int Value { get; set; }
        public string? Description { get; set; }
    }

    // Test repository implementation that accepts optional collection name
    public class TestMongoRepository : BaseMongoRepository<TestEntity>
    {
        public TestMongoRepository(IMongoDatabase database) : base(database)
        {
        }

        public TestMongoRepository(IMongoDatabase database, string collectionName) : base(database, collectionName)
        {
        }
    }
}